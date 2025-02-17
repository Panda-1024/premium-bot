const { Scenes, Markup } = require('telegraf');
const QRCode = require('qrcode');
const User = require('../../../models/user');
const Order = require('../../../models/order');
const { Price } = require('../../../models/price');
const { searchUser } = require('../../blockchain/ton')
const logger = require('../../../utils/logger');
const config = require('../../../config');

// 创建购买场景
const buyScene = new Scenes.BaseScene('buy');

// 进入购买场景
buyScene.enter(async (ctx) => {
    try {
        const prices = await Price.find({ isActive: true }).sort({ duration: 1 });
        if (!prices.length) {
            await ctx.reply('抱歉，暂无可用套餐。');
            return ctx.scene.leave();
        }

        const buttons = prices.map(price => {
            const discountedPrice = price.price * (1 - price.discount / 100);
            return [Markup.button.callback(
                `${price.description} (${discountedPrice.toFixed(2)} USDT)`,
                `select_plan:${price.duration}`
            )];
        });

        buttons.push([Markup.button.callback('❌取消', 'cancel')]);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(
                '请选择要购买的套餐：',
                Markup.inlineKeyboard(buttons)
            );
        } else {
            await ctx.reply(
                '请选择要购买的套餐：',
                Markup.inlineKeyboard(buttons)
            );
        }
    } catch (error) {
        logger.error('Error in buy scene enter:', error);
        await ctx.reply('获取套餐信息失败，请稍后重试。');
        ctx.scene.leave();
    }
});

// 选择套餐
buyScene.action(/select_plan:(\d+)/, async (ctx) => {
    try {
        const duration = parseInt(ctx.match[1]);
        ctx.scene.state.duration = duration;

        const price = await Price.findOne({ duration });
        if (!price) {
            await ctx.reply('套餐信息不存在，请重新选择。');
            return ctx.scene.reenter();
        }

        const discountedPrice = price.price * (1 - price.discount / 100);
        ctx.scene.state.amount = discountedPrice;

        // 选择购买对象
        const buttons = [
            [Markup.button.callback('⭐️给自己开通', 'buy_for_self')],
            [Markup.button.callback('🎁赠送好友', 'buy_for_friend')],
            [Markup.button.callback('返回', 'back_to_plans')]
        ];

        await ctx.editMessageText(
            `您选择了 ${price.description}，价格 ${discountedPrice.toFixed(2)} USDT\n\n` +
            '请选择开通对象：',
            Markup.inlineKeyboard(buttons)
        );
    } catch (error) {
        logger.error('Error selecting plan:', error);
        await ctx.reply('选择套餐失败，请重试。');
        await ctx.scene.leave();
    }
});

// 给自己购买
buyScene.action('buy_for_self', async (ctx) => {
    try {
        const username = ctx.from.username;
        if (!username) {
            await ctx.reply('您需要设置用户名才能使用此功能。');
            return ctx.scene.leave();
        }

        const duration = ctx.scene.state.duration;

        // 先通过 Telegram API 查询用户
        const searchResult = await searchUser(username, duration);
        
        if (searchResult.error) {
            await ctx.reply(
                `下单失败：${searchResult.error}\n` +
                '请重新输入或点击返回：',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'back_to_select_recipient')]])
            );
            return;
        }

        if (!searchResult.found) {
            await ctx.reply(
                '您的账号不满足开通条件。\n' +
                '请确认以下条件：\n' +
                '• 用户在过去30天内有活动\n' +
                '• 用户允许接收礼物\n\n',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'back_to_select_recipient')]])
            );
            return;
        }

        // 查找或创建用户记录
        let user = await User.findOne({ telegramId: ctx.from.id });
        if (!user) {
            user = await User.create({
                telegramId: ctx.from.id,
                username: username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                isAdmin: config.bot.adminUserIds.includes(ctx.from.id)
            });
        }

        await ctx.deleteMessage(ctx.msgId);

        await createOrder(ctx, user, username, false);
    } catch (error) {
        logger.error('Error in buy for self:', error);
        await ctx.reply('创建订单失败，请重试。');
        await ctx.scene.leave();
    }
});

// 赠送好友
buyScene.action('buy_for_friend', async (ctx) => {
    await ctx.editMessageText(
        '请输入好友的 Telegram 用户名（以 @ 开头）：\n' +
        '例如：@username'
    );
    ctx.scene.state.waitingForUsername = true;
});

// 处理好友用户名输入
buyScene.hears((_, ctx) => { 
    return ctx.scene.state.waitingForUsername
}, async (ctx) => {
    try {
        const username = ctx.message.text.replace('@', '');
        const duration = ctx.scene.state.duration;

        // 先通过 Telegram API 查询用户
        const searchResult = await searchUser(username, duration);
        
        if (searchResult.error) {
            await ctx.reply(
                `下单失败：${searchResult.error}\n` +
                '请重新输入或点击返回：',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'back_to_select_recipient')]])
            );
            return;
        }

        if (!searchResult.found) {
            await ctx.reply(
                '未找到该用户，或该用户不满足赠送条件。\n' +
                '请确认以下条件：\n' +
                '• 用户名拼写正确\n' +
                '• 用户在过去30天内有活动\n' +
                '• 用户允许接收礼物\n\n' +
                '请重新输入或点击返回：',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'back_to_select_recipient')]])
            );
            return;
        }

        // 查找或创建用户记录（购买者）
        let buyer = await User.findOne({ telegramId: ctx.from.id });
        if (!buyer) {
            buyer = await User.create({
                telegramId: ctx.from.id,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                isAdmin: config.bot.adminUserIds.includes(ctx.from.id)
            });
        }

        ctx.scene.state.waitingForUsername = false;
        await createOrder(ctx, buyer, username, true);
    } catch (error) {
        logger.error('Error processing friend username:', error);
        await ctx.reply(
            '处理用户名失败：' + error.message + '\n' +
            '请重新输入或点击返回：',
            Markup.inlineKeyboard([[Markup.button.callback('返回', 'back_to_select_recipient')]])
        );
    }
});

// 返回套餐选择
buyScene.action('back_to_plans', async (ctx) => {
    await ctx.scene.reenter();
});

// 返回选择购买对象
buyScene.action('back_to_select_recipient', async (ctx) => {
    const duration = ctx.scene.state.duration;
    const price = await Price.findOne({ duration });
    const discountedPrice = price.price * (1 - price.discount / 100);

    const buttons = [
        [Markup.button.callback('⭐️给自己开通', 'buy_for_self')],
        [Markup.button.callback('🎁赠送好友', 'buy_for_friend')],
        [Markup.button.callback('返回', 'back_to_plans')]
    ];

    await ctx.editMessageText(
        `您选择了 ${price.description}，价格 ${discountedPrice.toFixed(2)} USDT\n\n` +
        '请选择开通对象：',
        Markup.inlineKeyboard(buttons)
    );
});

// 获取当前时间戳的格式化部分
const generateTimestamp = () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2); // 获取两位年份
    const MM = String(now.getMonth() + 1).padStart(2, '0'); // 获取月份
    const dd = String(now.getDate()).padStart(2, '0'); // 获取日期
    const HH = String(now.getHours()).padStart(2, '0'); // 获取小时
    const mm = String(now.getMinutes()).padStart(2, '0'); // 获取分钟
    const ss = String(now.getSeconds()).padStart(2, '0'); // 获取秒钟
  
    return `${yy}${MM}${dd}${HH}${mm}${ss}`;
};

// 生成8位随机数
const generateRandomNumber = () => {
    return Math.floor(Math.random() * 99999999); // 生成一个 8 位数字
};
  
// 组合时间戳和随机数
const generateId = () => {
    const timestamp = generateTimestamp();
    const randomNumber = generateRandomNumber();
    return `${timestamp}${String(randomNumber).padStart(8, '0')}`; // 保证8位随机数
};

// 创建订单
async function createOrder(ctx, buyer, recipientUsername, isGift = false) {
    try {
        const duration = ctx.scene.state.duration;
        let amount = ctx.scene.state.amount;

        while (true) {
            // 检查是否有相同金额的待支付订单
            const existingOrder = await Order.findOne({
                status: 'pending',
                amount: amount,
                expireAt: { $gt: new Date() }
            });

            if (existingOrder) {
                // 如果存在相同金额的订单，增加 0.001 USDT
                amount = parseFloat((amount + 0.001).toFixed(3));
            } else {
                break;
            }
        }

        // 获取系统配置的支付地址
        const paymentAddress = config.tron.address;
        if (!paymentAddress) {
            throw new Error('系统支付地址未配置');
        }

        // 创建订单
        const order = await Order.create({
            orderId: generateId(),
            userId: buyer._id,  // 使用买家的 MongoDB ID
            username: recipientUsername,
            type: 'premium',
            duration,
            amount,
            paymentAddress,
            expireAt: new Date(Date.now() + 30 * 60 * 1000) // 30分钟过期
        });

        // 生成二维码
        const qrCode = await QRCode.toDataURL(paymentAddress);

        // 发送支付信息
        let message = '📝 *订单信息：*\n\n';
        message += `订单号：\`${order.orderId}\`\n`;
        message += `套餐时长：*${duration}* 个月\n`;
        message += `支付金额：*${amount.toFixed(3)}* USDT\n`;
        if (isGift) {
            message += `赠送用户：@${recipientUsername}\n`;
        }
        message += `支付地址：\`${paymentAddress}\`\n\n`;
        message += '请在30分钟内完成支付，超时订单将自动取消。\n';
        message += '支付完成后，系统会自动确认并开通服务。\n\n';
        message += '*注意：请务必转账完全相同的金额，否则无法自动确认订单*';

        await ctx.replyWithPhoto(
            { source: Buffer.from(qrCode.split(',')[1], 'base64') },
            { 
                caption: message.replaceAll('\\_', '_').replaceAll('_', '\\_'),
                parse_mode: 'Markdown'
            }
        );

        await ctx.scene.leave();
    } catch (error) {
        logger.error('Error creating order:', error);
        await ctx.reply('创建订单失败，请重试。');
        await ctx.scene.leave();
    }
}

// 取消操作
buyScene.action('cancel', async (ctx) => {
    await ctx.deleteMessage(ctx.msgId);
    await ctx.scene.leave();
});

// 导出场景和设置函数
const setupBuyHandlers = (bot) => {
    // 这里可以添加其他非场景相关的处理程序
};

module.exports = {
    buyScene,
    setupBuyHandlers
}; 