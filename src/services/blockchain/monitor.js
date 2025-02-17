const { TronWeb } = require('tronweb');
const { verifyTransaction, getTronWeb, getLatestBlock } = require('./tron');
const { activatePremium } = require('./ton');
const Order = require('../../models/order');
const User = require('../../models/user');
const config = require('../../config');
const { getConfig, setConfig } = require('../../models/config');
const logger = require('../../utils/logger');

// 发送通知给用户
async function sendNotificationToUser(bot, telegramId, message) {
    try {
        await bot.telegram.sendMessage(telegramId, message.replaceAll('_', '\\_'), { parse_mode: 'Markdown' });
    } catch (error) {
        logger.error(`Error sending notification to user ${telegramId}:`, error);
    }
}

// 发送通知给管理员
async function sendNotificationToAdmins(bot, message) {
    try {
        const adminIds = config.bot.adminUserIds;
        for (const adminId of adminIds) {
            await bot.telegram.sendMessage(adminId, message.replaceAll('_', '\\_'), { parse_mode: 'Markdown' });
        }
    } catch (error) {
        logger.error('Error sending notification to admins:', error);
    }
}

// 处理支付确认
const handlePaymentConfirmation = async (bot, order, txId) => {
    try {
        // 验证交易
        const { valid, message } = await verifyTransaction(txId);
        if (!valid) {
            logger.error(`Invalid transaction for order ${order.orderId}: ${message}`);
            return false;
        }

        // 更新订单状态为已支付
        order.status = 'paid';
        order.transactionHash = txId;
        await order.save();

        // 获取用户信息
        const user = await User.findById(order.userId);
        if (!user) {
            logger.error(`User not found for order ${order.orderId}`);
            return false;
        }

        // 发送支付确认通知
        const paymentConfirmMessage = 
            `💰 *支付确认成功*\n\n` +
            `订单号: \`${order.orderId}\`\n` +
            `支付金额: *${order.amount}* USDT\n` +
            `交易哈希: \`${txId}\`\n\n` +
            `系统正在为您开通 Premium，请稍候...`;

        await sendNotificationToUser(bot, user.telegramId, paymentConfirmMessage);

        const adminPaymentMessage = 
            `💰 *新支付确认*\n\n` +
            `用户: ${user.username ? '@' + user.username : user.telegramId}\n` +
            `订单号: \`${order.orderId}\`\n` +
            `支付金额: *${order.amount}* USDT\n` +
            `交易哈希: \`${txId}\``;

        await sendNotificationToAdmins(bot, adminPaymentMessage);

        try {
            // 开通 Premium
            const result = await activatePremium(order.username, order.duration);
            
            // 更新订单状态为已完成
            order.status = 'completed';
            order.completedAt = new Date();
            order.tonTransactionHash = result.transactionId;
            await order.save();

            // 发送开通成功通知
            const successMessage = 
                `✅ *Premium 开通成功*\n\n` +
                `订单号: \`${order.orderId}\`\n` +
                `开通时长: *${order.duration}* 个月\n` +
                `TON 交易哈希: \`${result.transactionId}\`\n\n` +
                `感谢您的使用！`;

            await sendNotificationToUser(bot, user.telegramId, successMessage);

            const adminSuccessMessage = 
                `✅ *Premium 开通成功*\n\n` +
                `用户: ${user.username ? '@' + user.username : user.telegramId}\n` +
                `订单号: \`${order.orderId}\`\n` +
                `开通时长: *${order.duration}* 个月\n` +
                `TON 交易哈希: \`${result.transactionId}\``;

            await sendNotificationToAdmins(bot, adminSuccessMessage);

            logger.info(`Premium activated for user ${order.username}, duration: ${order.duration} months, transaction: ${result.transactionId}`);
            return true;
        } catch (error) {
            logger.error(`Error activating premium for order ${order.orderId}:`, error);
            
            // 更新订单状态为失败
            order.status = 'failed';
            order.failureReason = error.message;
            await order.save();

            // 发送开通失败通知
            const failureMessage = 
                `❌ *Premium 开通失败*\n\n` +
                `订单号: \`${order.orderId}\`\n` +
                `失败原因: ${error.message}\n\n` +
                `请联系管理员处理！`;

            await sendNotificationToUser(bot, user.telegramId, failureMessage);

            const adminFailureMessage = 
                `❌ *Premium 开通失败*\n\n` +
                `用户: ${user.username ? '@' + user.username : user.telegramId}\n` +
                `订单号: \`${order.orderId}\`\n` +
                `失败原因: ${error.message}`;

            await sendNotificationToAdmins(bot, adminFailureMessage);
            
            return false;
        }
    } catch (error) {
        logger.error('Error in payment confirmation:', error);
        return false;
    }
};

// 查找匹配的待支付订单
const findMatchingOrder = async (amount) => {
    try {
        // 查找金额匹配且未过期的待支付订单
        return await Order.findOne({
            status: 'pending',
            amount: amount,
            expireAt: {$gt: new Date()}
        }).sort({createdAt: -1});
    } catch (error) {
        logger.error('Error finding matching order:', error);
        return null;
    }
};

// 处理 USDT 转账事件
const handleUsdtTransfer = async (bot, event) => {
    try {
        const amount = event.result.value / 1e6; // 转换为 USDT
        const from = TronWeb.address.fromHex(event.result.from);
        const to = TronWeb.address.fromHex(event.result.to);
        const txId = event.transaction_id;

        // 检查收款地址是否匹配
        const paymentAddress = await getConfig('PAYMENT_ADDRESS');
        if (!paymentAddress || to !== paymentAddress) {
            return;
        }

        logger.info(`Processing USDT transfer: ${amount} USDT, txId: ${txId}, from: ${from}, to: ${to}`);

        // 查找匹配的订单
        const matchingOrder = await findMatchingOrder(amount);
        if (!matchingOrder) {
            logger.warn(`No matching order found for amount ${amount} USDT`);
            return;
        }

        // 处理支付确认
        const confirmed = await handlePaymentConfirmation(bot, matchingOrder, txId);
        if (confirmed) {
            logger.info(`Payment confirmed for order ${matchingOrder.orderId}`);
        }
    } catch (error) {
        logger.error('Error handling USDT transfer:', error);
    }
};

// 检查过期订单
const checkExpiredOrders = async () => {
    try {
        const expiredOrders = await Order.find({
            status: 'pending',
            expireAt: { $lt: new Date() }
        });

        for (const order of expiredOrders) {
            order.status = 'expired';
            await order.save();
            logger.info(`Order ${order.orderId} marked as expired`);
        }
    } catch (error) {
        logger.error('Error checking expired orders:', error);
    }
};

// USDT 合约地址
const USDT_CONTRACT = {
    mainnet: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT-TRC20
    testnet: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'  // 测试网 USDT
};

// 监控 USDT 转账
const monitorUsdtTransfers = async (bot) => {
    try {
        const tronWeb = getTronWeb();
        
        // 获取上次检查的区块号
        let lastCheckedBlock = parseInt(await getConfig('LAST_CHECKED_BLOCK')) || 0;
        
        // 如果没有上次检查的区块号，使用最新区块号 - 6
        if (lastCheckedBlock === 0) {
            const latestBlock = await getLatestBlock();
            lastCheckedBlock = Math.max(0, latestBlock - 6);
            await setConfig('LAST_CHECKED_BLOCK', lastCheckedBlock.toString());
        }

        let checking = false
        
        // 每秒检查一次
        setInterval(async () => {
            // 避免重复检查
            if (checking) {
                return;
            }
            try {
                checking = true
                // 获取最新区块号
                const latestBlock = await getLatestBlock();
                const targetBlock = lastCheckedBlock + 1

                // 如果没有新区块，跳过
                if (targetBlock >= latestBlock - 6) {
                    return;
                }

                // 获取区块内的 USDT 转账事件
                const events = await tronWeb.event.getEventsByContractAddress(
                    USDT_CONTRACT[config.tron.network],
                    {
                        eventName: 'Transfer',
                        blockNumber: targetBlock
                    }
                );

                if (events.success && events.data.length > 0) {
                    for (const event of events.data) {
                        await handleUsdtTransfer(bot, event);
                    }
                }

                // 更新最后检查的区块号
                lastCheckedBlock = targetBlock;
                await setConfig('LAST_CHECKED_BLOCK', lastCheckedBlock.toString());
                
                logger.debug(`Checked block ${targetBlock} for USDT transfers`);
            } catch (error) {
                logger.error('Error in USDT transfer monitoring interval:', error);
            } finally {
                checking = false
            }
        }, 1000); // 每秒检查一次

        logger.info('USDT transfer monitoring started');
    } catch (error) {
        logger.error('Error starting USDT transfer monitoring:', error);
        throw error;
    }
};

// 启动监控服务
const startMonitoringTasks = async (bot) => {
    try {
        // 启动 USDT 转账监控
        await monitorUsdtTransfers(bot);

        // 每分钟检查一次过期订单
        setInterval(checkExpiredOrders, 60000);
        logger.info('Expired orders checking started');
    } catch (error) {
        logger.error('Error starting monitoring tasks:', error);
        throw error;
    }
};

module.exports = {
    startMonitoringTasks
}; 