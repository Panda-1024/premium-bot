const { Scenes, Markup } = require('telegraf');
const moment = require('moment');
const User = require('../../../models/user');
const { getUserOrders, getOrderDetails, cancelOrder } = require('../../order');
const logger = require('../../../utils/logger');

// 创建订单场景
const ordersScene = new Scenes.BaseScene('orders');

// 进入订单场景
ordersScene.enter(async (ctx) => {
    await showOrderList(ctx, 1);
});

// 显示订单列表
async function showOrderList(ctx, page, status = null) {
    try {
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (!user) {
            await ctx.reply('用户信息不存在，请重新开始。');
            return ctx.scene.leave();
        }

        // 获取用户订单列表
        const { orders, pagination } = await getUserOrders(user._id, {
            page,
            limit: 5,
            status
        });

        if (!orders.length) {
            await ctx.reply(
                '暂无订单记录。'
            );
            return;
        }

        // 生成订单列表消息
        let message = '📋 订单记录\n\n';
        orders.forEach(order => {
            message += formatOrderMessage(order);
        });

        // 添加分页信息
        message += `\n页码: ${pagination.page}/${pagination.totalPages}`;

        // 创建操作按钮
        const buttons = [];
        
        // 分页按钮
        if (pagination.totalPages > 1) {
            const pageButtons = [];
            if (page > 1) {
                pageButtons.push(Markup.button.callback('⬅️前一页', `page:${page - 1}`));
            }
            if (page < pagination.totalPages) {
                pageButtons.push(Markup.button.callback('➡️下一页', `page:${page + 1}`));
            }
            if (pageButtons.length > 0) {
                buttons.push(pageButtons);
            }
        }

        // 筛选和刷新按钮
        buttons.push([
            Markup.button.callback('🔍 按状态筛选', 'filter_status')
        ]);

        buttons.push([
            Markup.button.callback('❌关闭', 'close')
        ]);

        // 如果是编辑现有消息
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
        } else {
            await ctx.reply(message, Markup.inlineKeyboard(buttons));
        }
    } catch (error) {
        logger.error('Error showing order list:', error);
        await ctx.reply('获取订单列表失败，请重试。');
    }
}

// 处理分页
ordersScene.action(/page:(\d+)/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await showOrderList(ctx, page);
    } catch (error) {
        logger.error('Error in pagination:', error);
        await ctx.answerCbQuery('获取订单列表失败，请重试');
    }
});

// 处理刷新
ordersScene.action(/refresh:(\d+)/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await showOrderList(ctx, page);
        await ctx.answerCbQuery('已刷新');
    } catch (error) {
        logger.error('Error refreshing list:', error);
        await ctx.answerCbQuery('刷新失败，请重试');
    }
});

// 处理状态筛选
ordersScene.action('filter_status', async (ctx) => {
    const buttons = [
        [
            Markup.button.callback('全部订单', 'filter:all'),
            Markup.button.callback('待支付', 'filter:pending')
        ],
        [
            Markup.button.callback('已完成', 'filter:completed'),
            Markup.button.callback('已失败', 'filter:failed')
        ],
        [
            Markup.button.callback('已过期', 'filter:expired'),
            Markup.button.callback('已退款', 'filter:refunded')
        ],
        [Markup.button.callback('返回', 'refresh:1')]
    ];

    await ctx.editMessageText(
        '请选择要查看的订单状态：',
        Markup.inlineKeyboard(buttons)
    );
});

// 处理状态筛选选择
ordersScene.action(/filter:(.+)/, async (ctx) => {
    try {
        const status = ctx.match[1];
        const filteredStatus = status === 'all' ? null : status;
        await showOrderList(ctx, 1, filteredStatus);
    } catch (error) {
        logger.error('Error filtering orders:', error);
        await ctx.answerCbQuery('筛选失败，请重试');
    }
});

// 关闭
ordersScene.action('close', async (ctx) => {
    await ctx.deleteMessage(ctx.msgId);
    await ctx.scene.leave();
});

// 格式化订单消息
function formatOrderMessage(order, detailed = false) {
    let message = '';
    message += `订单号：${order.orderId}\n`;
    message += `类型：${order.type === 'premium' ? 'Premium 会员' : '其他'}\n`;
    if (order.type === 'premium') {
        message += `开通账号: @${order.username}\n`;
    }
    message += `金额：${order.amount} USDT\n`;
    message += `状态：${getOrderStatus(order.status)}\n`;
    message += `创建时间：${moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss')}\n`;

    if (detailed) {
        message += `\n套餐时长：${order.duration} 个月\n`;
        message += `支付地址：\`${order.paymentAddress}\`\n`;
        if (order.completedAt) {
            message += `完成时间：${moment(order.completedAt).format('YYYY-MM-DD HH:mm:ss')}\n`;
        }
        if (order.failureReason) {
            message += `失败原因：${order.failureReason}\n`;
        }
    }

    message += '\n';
    return message;
}

// 获取订单状态显示文本
function getOrderStatus(status) {
    const statusMap = {
        pending: '⏳ 待支付',
        paid: '💱 已支付',
        completed: '✅ 已完成',
        failed: '❌ 已失败',
        expired: '⚠️ 已过期',
        refunded: '↩️ 已退款'
    };
    return statusMap[status] || status;
}

// 导出场景和设置函数
const setupOrderHandlers = (bot) => {
    // 这里可以添加其他非场景相关的处理程序
};

module.exports = {
    ordersScene,
    setupOrderHandlers
}; 