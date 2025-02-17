const { Markup } = require('telegraf');
const User = require('../../models/user');
const { Price } = require('../../models/price');
const config = require('../../config');
const logger = require('../../utils/logger');

// 启动命令
const startCommand = async (ctx) => {
    try {
        const { id: telegramId, username, first_name, last_name } = ctx.from;

        // 查找或创建用户
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = await User.create({
                telegramId,
                username,
                firstName: first_name,
                lastName: last_name,
                isAdmin: config.bot.adminUserIds.indexOf(telegramId) >= 0
            });
            logger.info(`New user registered: ${telegramId}`);
        }

        // 更新用户信息
        await User.findByIdAndUpdate(user._id, {
            isAdmin: config.bot.adminUserIds.indexOf(telegramId) >= 0,
            lastActivityAt: new Date(),
            username  // 更新用户名（可能会变）
        });

        // 生成欢迎消息
        const welcomeMessage = `欢迎使用 Telegram Premium 自助开通机器人！\n\n` +
            `您可以通过本机器人快速开通 Telegram Premium 会员，支持 USDT-TRC20 支付。\n\n` +
            `请选择以下操作：`;

        // 创建主菜单按钮
        const mainMenu = [
            ['💎 购买 Premium', '📋 订单记录'],
            ['👤 个人中心', '❓ 使用帮助']
        ];

        logger.debug(`admin ids: ${config.bot.adminUserIds}`)

        // 如果是管理员，添加管理菜单
        if (config.bot.adminUserIds.indexOf(telegramId) >= 0 || user.isAdmin) {
            mainMenu.push(['⚙️ 管理面板']);
        }

        await ctx.reply(welcomeMessage, Markup.keyboard(mainMenu).resize());
    } catch (error) {
        logger.error('Error in start command:', error);
        await ctx.reply('抱歉，系统出现错误，请稍后重试。');
    }
};

// 查看套餐命令
const viewPlansCommand = async (ctx) => {
    try {
        const prices = await Price.find({ isActive: true }).sort({ duration: 1 });
        
        if (!prices.length) {
            return await ctx.reply('暂无可用套餐，请稍后再试。');
        }

        let message = '📦 可用套餐列表：\n\n';
        prices.forEach(price => {
            const discountedPrice = price.price * (1 - price.discount / 100);
            message += `${price.description}\n` +
                `时长：${price.duration} 个月\n` +
                `价格：${discountedPrice.toFixed(2)} USDT\n` +
                `折扣：${price.discount}%\n\n`;
        });

        message += '选择套餐后，点击"💎 购买 Premium"开始购买流程。';

        await ctx.reply(message);
    } catch (error) {
        logger.error('Error in viewPlans command:', error);
        await ctx.reply('抱歉，获取套餐信息失败，请稍后重试。');
    }
};

// 帮助命令
const helpCommand = async (ctx) => {
    const helpMessage = 
        '📖 使用帮助\n\n' +
        '1. 点击"💎 购买 Premium"开始购买\n' +
        '2. 选择套餐\n' +
        '3. 选择给自己开通或者赠送好友\n' +
        '4. 使用 TRON 钱包转账支付 USDT-TRC20\n' +
        '5. 等待系统确认支付\n' +
        '6. 完成开通\n\n' +
        '常见问题：\n' +
        '• 支付后多久到账？\n' +
        '  一般 1-3 分钟内完成\n\n' +
        '• 支持哪些支付方式？\n' +
        '  支持 USDT-TRC20\n\n' +
        '• 开通失败怎么办？\n' +
        '  请联系客服处理\n\n' +
        '如需帮助，请联系管理员。';

    await ctx.reply(helpMessage);
};

module.exports = {
    startCommand,
    viewPlansCommand,
    helpCommand
}; 