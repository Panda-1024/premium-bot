const TonWeb = require('tonweb');
const { mnemonicToKeyPair } = require('tonweb-mnemonic');
const BN = TonWeb.utils.BN;
const axios = require('axios');
const config = require('../../config');
const logger = require('../../utils/logger');
const { getConfig } = require('../../models/config');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// TON 网络配置
const TON_CONFIG = {
    mainnet: {
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TON_API_KEY
    },
    testnet: {
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TON_TESTNET_API_KEY
    }
};

// Fragment API 配置
const FRAGMENT_API_OPTIONS = {
    headers: config.fragment.api.headers,
    timeout: 10000
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

// 创建 TonWeb 实例
function createTonWeb() {
    const network = config.ton?.network || 'mainnet';
    const options = {
        apiKey: TON_CONFIG[network].apiKey
    };
    
    // 配置代理
    const proxyAgent = getProxyConfig();
    if (proxyAgent) {
        options.agent = proxyAgent;
        logger.info(`TonWeb using ${config.bot.proxy.type} proxy: ${config.bot.proxy.host}:${config.bot.proxy.port}`);
    }
    
    return new TonWeb(new TonWeb.HttpProvider(TON_CONFIG[network].endpoint, options));
}

// 初始化 TonWeb 实例
const tonweb = createTonWeb();

// 搜索用户
async function searchUser(query, months) {
    try {
        const options = { ...FRAGMENT_API_OPTIONS };
        const proxyAgent = getProxyConfig();
        if (proxyAgent) {
            options.httpsAgent = proxyAgent;
        }

        const response = await axios.post(
            'https://fragment.com/api?hash=' + config.fragment.api.hash,
            new URLSearchParams({
                query,
                months: months.toString(),
                method: 'searchPremiumGiftRecipient'
            }),
            options
        );

        return response.data;
    } catch (error) {
        logger.error('搜索用户失败:', error);
        throw error;
    }
}

// 初始化礼物请求
async function initGiftRequest(recipient, months) {
    try {
        const options = { ...FRAGMENT_API_OPTIONS };
        const proxyAgent = getProxyConfig();
        if (proxyAgent) {
            options.httpsAgent = proxyAgent;
        }

        const response = await axios.post(
            'https://fragment.com/api?hash=' + config.fragment.api.hash,
            new URLSearchParams({
                recipient,
                months: months.toString(),
                method: 'initGiftPremiumRequest'
            }),
            options
        );

        if (!response.data) {
            throw new Error(response.data.error || '初始化礼物请求失败');
        }

        return response.data.req_id;
    } catch (error) {
        logger.error('初始化礼物请求失败:', error);
        throw error;
    }
}

// 获取支付信息
async function getPaymentInfo(reqId, recipient) {
    try {
        const options = { ...FRAGMENT_API_OPTIONS };
        const proxyAgent = getProxyConfig();
        if (proxyAgent) {
            options.httpsAgent = proxyAgent;
        }

        const response = await axios.post(
            'https://fragment.com/api?hash=' + config.fragment.api.hash,
            new URLSearchParams({
                id: reqId,
                account: JSON.stringify(config.fragment.account),
                device: JSON.stringify(config.fragment.device),
                transaction: "1",
                show_sender: "0",
                method: 'getGiftPremiumLink'
            }),
            options
        );

        if (!response.data.ok) {
            throw new Error(response.data.error || '获取支付信息失败');
        }

        return response.data.transaction.messages[0];
    } catch (error) {
        logger.error('获取支付信息失败:', error);
        throw error;
    }
}

// 发送 TON
async function sendTon(toAddress, amount, payload) {
    try {
        const keyPair = await mnemonicToKeyPair(config.ton.mnemonic.split(' '));
        const wallet = tonweb.wallet.create({ publicKey: keyPair.publicKey });
        const seqno = await wallet.methods.seqno().call() || 0;

        const address = (await wallet.getAddress()).toString(true, true, true);
        logger.info('发送地址:', address);

        const balance = await tonweb.provider.getBalance(address);
        logger.info('钱包余额:', balance);

        if (amount.gte(new BN(balance))) {
            throw new Error(`余额不足, 剩余 ${balance / 1000000000}, 请充值: ${address}`);
        }

        const info = await tonweb.provider.getAddressInfo(toAddress);
        if (info.state !== 'active') {
            toAddress = new TonWeb.utils.Address(toAddress).toString(true, true, false);
        }

        logger.info('目标地址:', toAddress, 'amount:', amount.toString(), 'seqno:', seqno);

        const transfer = wallet.methods.transfer({
            secretKey: keyPair.secretKey,
            toAddress: toAddress,
            amount: amount,
            seqno: seqno,
            payload: payload
        });

        const transferFee = await transfer.estimateFee();
        logger.info('转账费用:', transferFee);

        const transferResult = await transfer.send();
        logger.info('转账结果:', transferResult);
        return transferResult;
    } catch (error) {
        logger.error('发送 TON 失败:', error);
        throw error;
    }
}

// 开通 Premium
async function activatePremium(username, months) {
    try {
        // 1. 搜索用户
        const { found } = await searchUser(username, months);
        if (!found || !found.recipient) {
            throw new Error('未找到用户');
        }

        // 2. 初始化礼物请求
        const reqId = await initGiftRequest(found.recipient, months);

        // 3. 获取支付信息
        const paymentInfo = await getPaymentInfo(reqId, found.recipient);
        if (!paymentInfo) {
            throw new Error('获取支付信息失败');
        }

        const { address, amount } = paymentInfo;
        var payload = paymentInfo.payload;
        payload = decodeBase64Payload(payload);
        payload = extractRefFromPayload(payload);
        payload = 'Telegram Premium for ' + months + ' months Ref#' + payload;
        logger.info('支付信息:', { address, amount, payload });

        // 4. 发送 TON
        const result = await sendTon(
            address,
            new BN(amount),
            payload
        );

        return {
            success: true,
            transactionId: result.transaction_id,
            amount: amount / 1000000000
        };
    } catch (error) {
        logger.error('开通 Premium 失败:', error);
        throw error;
    }
}

// 解码 base64 载荷
function decodeBase64Payload(payload) {
    try {
        const buffer = Buffer.from(payload, 'base64');
        return buffer.toString('utf8');
    } catch (error) {
        logger.error('解码 base64 载荷失败:', error);
        throw error;
    }
}

// 从载荷中提取引用号
function extractRefFromPayload(payload) {
    try {
        const match = payload.match(/Ref#(\d+)/);
        return match ? match[1] : '';
    } catch (error) {
        logger.error('从载荷中提取引用号失败:', error);
        throw error;
    }
}

module.exports = {
    searchUser,
    activatePremium
}; 