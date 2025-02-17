const { Telegraf, session, Scenes } = require('telegraf');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');
const logger = require('../../utils/logger');
const { startCommand, viewPlansCommand, helpCommand } = require('./commands');
const { buyScene, setupBuyHandlers } = require('./handlers/buy');
const { userCenterScene, setupUserCenterHandlers } = require('./handlers/userCenter');
const { ordersScene, setupOrderHandlers } = require('./handlers/order');
const { adminScene, setupAdminHandlers } = require('./handlers/admin');

// 创建机器人实例
const createBot = () => {
    const options = {};
    
    // 配置代理
    if (config.bot.proxy.enabled) {
        const { type, host, port, auth, username, password } = config.bot.proxy;
        const proxyUrl = auth 
            ? `${type}://${username}:${password}@${host}:${port}`
            : `${type}://${host}:${port}`;
            
        // 根据代理类型选择代理代理
        const ProxyAgent = type === 'socks5' ? SocksProxyAgent : HttpsProxyAgent;
        options.telegram = {
            agent: new ProxyAgent(proxyUrl)
        };
        
        logger.info(`Bot using ${type} proxy: ${host}:${port}`);
    }
    
    return new Telegraf(config.bot.token, options);
};

// 设置机器人
const setupBot = () => {
    // 创建带代理的机器人实例
    const bot = createBot();

    // 创建场景管理器并添加所有场景
    const stage = new Scenes.Stage([
        buyScene,
        userCenterScene,
        ordersScene,
        adminScene
    ]);

    // 使用中间件
    bot.use(session());
    bot.use(stage.middleware());

    // 访问控制中间件
    const accessMiddleware = async (ctx, next) => {
        try {
            const user = ctx.from;
            if (!user) {
                return await ctx.reply('请在私聊中使用机器人。');
            }

            // 检查用户是否被封禁
            const userDoc = await require('../../models/user').findOne({ telegramId: user.id });
            if (userDoc && userDoc.status === 'banned') {
                return await ctx.reply('您的账号已被封禁，请联系管理员。');
            }

            return next();
        } catch (error) {
            logger.error('Access middleware error:', error);
            await ctx.reply('系统错误，请稍后重试。');
        }
    };

    // 错误处理中间件
    const errorHandler = async (error, ctx) => {
        logger.error('Bot error:', error);
        try {
            await ctx.reply('抱歉，系统出现错误，请稍后重试。');
        } catch (e) {
            logger.error('Error in error handler:', e);
        }
    };

    // 使用中间件
    bot.use(accessMiddleware);

    // 设置命令
    bot.start(startCommand);
    bot.help(helpCommand);

    // 设置菜单处理程序
    bot.hears('💎 购买 Premium', ctx => ctx.scene.enter('buy'));
    bot.hears('🔍 查看套餐', viewPlansCommand);
    bot.hears('👤 个人中心', ctx => ctx.scene.enter('userCenter'));
    bot.hears('📋 订单记录', ctx => ctx.scene.enter('orders'));
    bot.hears('❓ 使用帮助', helpCommand);
    bot.hears('⚙️ 管理面板', ctx => ctx.scene.enter('admin'));

    // 设置各个功能模块的处理程序
    setupBuyHandlers(bot);
    setupUserCenterHandlers(bot);
    setupOrderHandlers(bot);
    setupAdminHandlers(bot);

    // 设置错误处理
    bot.catch(errorHandler);

    return bot;
};

module.exports = {
    setupBot
}; 