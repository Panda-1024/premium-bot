const { TronWeb } = require('tronweb');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');
const logger = require('../../utils/logger');
const { getConfig } = require('../../models/config');

// TRON 网络配置
const TRON_CONFIG = {
    mainnet: {
        fullNode: 'https://api.trongrid.io',
        solidityNode: 'https://api.trongrid.io',
        eventServer: 'https://api.trongrid.io'
    },
    testnet: {
        fullNode: 'https://nile.trongrid.io',
        solidityNode: 'https://nile.trongrid.io',
        eventServer: 'https://nile.trongrid.io'
    }
};

// USDT 合约地址
const USDT_CONTRACT = {
    mainnet: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT-TRC20
    testnet: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'  // 测试网 USDT
};

// 获取代理配置
function getProxyConfig() {
    const { proxy } = config.bot;
    if (!proxy.enabled) {
        return null;
    }

    const { type, host, port, auth, username, password } = proxy;
    const proxyUrl = auth 
        ? `${type}://${username}:${password}@${host}:${port}`
        : `${type}://${host}:${port}`;

    // 根据代理类型选择代理代理
    const ProxyAgent = type === 'socks5' ? SocksProxyAgent : HttpsProxyAgent;
    return new ProxyAgent(proxyUrl);
}

// 创建 TronWeb 实例
function createTronWeb() {
    const options = {};
    
    // 配置代理
    const proxyAgent = getProxyConfig();
    if (proxyAgent) {
        options.fullHost = TRON_CONFIG[config.tron.network].fullNode;
        options.solidityNode = TRON_CONFIG[config.tron.network].solidityNode;
        options.eventServer = TRON_CONFIG[config.tron.network].eventServer;
        options.privateKey = config.tron.privateKey;
        options.headers = {
            "TRON-PRO-API-KEY": config.tron.apiKey
        };
        options.httpsAgent = proxyAgent;
        
        logger.info(`TronWeb using ${config.bot.proxy.type} proxy: ${config.bot.proxy.host}:${config.bot.proxy.port}`);
        
        return new TronWeb(options);
    }
    
    // 不使用代理的默认配置
    return new TronWeb(
        TRON_CONFIG[config.tron.network].fullNode,
        TRON_CONFIG[config.tron.network].solidityNode,
        TRON_CONFIG[config.tron.network].eventServer,
        config.tron.privateKey
    );
}

// 初始化 TronWeb 实例
const tronWeb = createTronWeb();

// 生成新的支付地址
const generatePaymentAddress = async () => {
    try {
        const account = await tronWeb.createAccount();
        logger.info(`Generated new payment address: ${account.address.base58}`);
        return account.address.base58;
    } catch (error) {
        logger.error('Error generating payment address:', error);
        throw new Error('Failed to generate payment address');
    }
};

// 检查 TRX 余额
const checkTrxBalance = async (address) => {
    try {
        const balance = await tronWeb.trx.getBalance(address);
        return tronWeb.fromSun(balance); // 转换为 TRX
    } catch (error) {
        logger.error(`Error checking TRX balance for ${address}:`, error);
        throw new Error('Failed to check TRX balance');
    }
};

// 检查 USDT 余额
const checkUsdtBalance = async (address) => {
    try {
        const contract = await tronWeb.contract().at(USDT_CONTRACT[config.tron.network]);
        const balance = await contract.balanceOf(address).call();
        return balance.toString() / 1e6; // USDT 有 6 位小数
    } catch (error) {
        logger.error(`Error checking USDT balance for ${address}:`, error);
        throw new Error('Failed to check USDT balance');
    }
};

// 验证交易
const verifyTransaction = async (txId) => {
    try {
        const tx = await tronWeb.event.getEventsByTransactionID(txId);
        logger.debug(`tx: ${JSON.stringify(tx)}`)
        if (!tx) {
            return { valid: false, message: '交易不存在' };
        }

        if (!tx.success) {
            return { valid: false, message: '交易失败' };
        }

        return { valid: true, tx };
    } catch (error) {
        logger.error(`Error verifying transaction ${txId}:`, error);
        throw new Error('Failed to verify transaction');
    }
};

// 提取资金到主钱包
const withdrawToMainWallet = async (fromAddress, privateKey, currency) => {
    try {
        const mainAddress = config.tron.address;

        if (currency === 'TRX') {
            const balance = await checkTrxBalance(fromAddress);
            if (balance <= 0) {
                return { success: false, message: '余额不足' };
            }

            const tx = await tronWeb.trx.sendTransaction(mainAddress, 
                tronWeb.toSun(balance - 1), // 保留 1 TRX 作为手续费
                privateKey
            );
            return { success: true, tx };
        } else if (currency === 'USDT') {
            const contract = await tronWeb.contract().at(USDT_CONTRACT[config.tron.network]);
            const balance = await checkUsdtBalance(fromAddress);
            if (balance <= 0) {
                return { success: false, message: '余额不足' };
            }

            const tx = await contract.transfer(
                mainAddress,
                tronWeb.toSun(balance)
            ).send({
                feeLimit: 10000000,
                privateKey
            });
            return { success: true, tx };
        }
    } catch (error) {
        logger.error(`Error withdrawing from ${fromAddress}:`, error);
        throw new Error('Failed to withdraw funds');
    }
};

// 获取 TronWeb 实例
const getTronWeb = () => {
    return tronWeb;
};

// 获取最新区块号
const getLatestBlock = async () => {
    try {
        const block = await tronWeb.trx.getCurrentBlock();
        return block.block_header.raw_data.number;
    } catch (error) {
        logger.error('Error getting latest block:', error);
        throw error;
    }
};

module.exports = {
    generatePaymentAddress,
    checkUsdtBalance,
    verifyTransaction,
    withdrawToMainWallet,
    getTronWeb,
    getLatestBlock
}; 