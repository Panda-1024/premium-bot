const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: String
}, {
    timestamps: true
});

const Config = mongoose.model('Config', configSchema);

// 默认配置
const DEFAULT_CONFIGS = {
    PAYMENT_ADDRESS: {
        key: 'PAYMENT_ADDRESS',
        value: process.env.TRON_ADDRESS,
        description: 'USDT-TRC20 收款地址'
    },
    PAYMENT_TIMEOUT: {
        key: 'PAYMENT_TIMEOUT',
        value: 30,
        description: '支付超时时间（分钟）'
    }
};

// 初始化配置
const initializeConfigs = async () => {
    for (const config of Object.values(DEFAULT_CONFIGS)) {
        await Config.findOneAndUpdate(
            { key: config.key },
            config,
            { upsert: true }
        );
    }
};

// 获取配置值
const getConfig = async (key) => {
    const config = await Config.findOne({ key });
    return config ? config.value : null;
};

// 设置配置值
const setConfig = async (key, value, description = '') => {
    return await Config.findOneAndUpdate(
        { key },
        { value, description },
        { upsert: true, new: true }
    );
};

module.exports = {
    Config,
    initializeConfigs,
    getConfig,
    setConfig,
    DEFAULT_CONFIGS
}; 