const { Scenes, Markup } = require('telegraf');
const moment = require('moment');
const User = require('../../../models/user');
const Order = require('../../../models/order');
const logger = require('../../../utils/logger');

// 创建个人中心场景
const userCenterScene = new Scenes.BaseScene('userCenter');

// 进入个人中心
userCenterScene.enter(async (ctx) => {
    try {
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (!user) {
            await ctx.reply('用户信息不存在，请重新开始。');
            return ctx.scene.leave();
        }

        // 获取用户订单统计
        const orderStats = await Order.aggregate([
            { $match: { userId: user._id } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        // 格式化订单统计
        const stats = orderStats.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        // 生成用户信息消息
        let message = '👤 个人中心\n\n';
        message += `用户ID：${user.telegramId}\n`;
        message += `用户名：@${user.username || '未设置'}\n\n`;

        message += '📊 订单统计：\n';
        message += `总订单数：${orderStats.reduce((sum, curr) => sum + curr.count, 0)}\n`;
        message += `待支付：${stats.pending || 0}\n`;
        message += `已完成：${stats.completed || 0}\n`;
        message += `已取消：${(stats.failed || 0) + (stats.expired || 0)}\n`;

        await ctx.reply(message);
    } catch (error) {
        logger.error('Error in user center:', error);
        await ctx.reply('获取用户信息失败，请重试。');
        ctx.scene.leave();
    }
});

// 查看订单记录
userCenterScene.action('view_orders', async (ctx) => {
    try {
        const user = await User.findOne({ telegramId: ctx.from.id });
        const orders = await Order.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(5);

        if (!orders.length) {
            await ctx.reply('暂无订单记录。');
            return;
        }

        let message = '📋 最近订单记录：\n\n';
        orders.forEach(order => {
            message += `订单号：${order.orderId}\n`;
            message += `类型：${order.type === 'premium' ? 'Premium 会员' : '其他'}\n`;
            message += `金额：${order.amount} USDT\n`;
            message += `状态：${getOrderStatus(order.status)}\n`;
            message += `创建时间：${moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss')}\n\n`;
        });

        message += '如需查看更多订单，请点击"📋 订单记录"。';

        await ctx.reply(message);
    } catch (error) {
        logger.error('Error in view orders:', error);
        await ctx.reply('获取订单记录失败，请重试。');
    }
});

// 返回主菜单
userCenterScene.action('back_to_main', async (ctx) => {
    await ctx.reply('已返回主菜单');
    ctx.scene.leave();
});

// 订单状态转换
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
const setupUserCenterHandlers = (bot) => {
    // 这里可以添加其他非场景相关的处理程序
};

module.exports = {
    userCenterScene,
    setupUserCenterHandlers
}; 