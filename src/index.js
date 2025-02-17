const { Telegraf } = require('telegraf');
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const { connectMongo } = require('./config/database');
const { setupBot } = require('./services/bot');
const { startMonitoringTasks } = require('./services/blockchain/monitor');
const { initializePrices } = require('./models/price');
const { initializeConfigs } = require('./models/config');

// 创建 Express 应用
const app = express();
app.use(express.json());

// 初始化应用
const initializeApp = async () => {
    try {
        // 连接数据库
        await connectMongo();

        // 初始化系统配置
        await initializeConfigs();
        
        // 初始化价格配置
        await initializePrices();

        const bot = setupBot();
        // 启动区块链监控服务
        startMonitoringTasks(bot);
        logger.info('Blockchain monitoring service started');

        // 启动机器人
        await bot.launch(() => {
            logger.info('Telegram bot started successfully');
        });

        // 优雅退出
        process.once('SIGINT', () => {
            bot.stop('SIGINT');
            process.exit(0);
        });
        process.once('SIGTERM', () => {
            bot.stop('SIGTERM');
            process.exit(0);
        });
    } catch (error) {
        logger.error('Application initialization failed:', error);
        process.exit(1);
    }
};

initializeApp(); 