require('dotenv').config();

module.exports = {
    bot: {
        token: process.env.BOT_TOKEN,
        adminUserIds: process.env.ADMIN_USER_IDS?.split(',').map(id => Number(id)) || [],
        proxy: {
            enabled: process.env.TELEGRAM_PROXY_ENABLED === 'false',
            type: process.env.TELEGRAM_PROXY_TYPE || 'http',
            host: process.env.TELEGRAM_PROXY_HOST || '127.0.0.1',
            port: parseInt(process.env.TELEGRAM_PROXY_PORT) || 7890,
            auth: process.env.TELEGRAM_PROXY_AUTH === 'false',
            username: process.env.TELEGRAM_PROXY_USERNAME,
            password: process.env.TELEGRAM_PROXY_PASSWORD
        }
    },
    fragment: {
        api: {
            hash: process.env.FRAGMENT_API_HASH,
            cookie: process.env.FRAGMENT_API_COOKIE,
            headers: {
                'Cookie': process.env.FRAGMENT_API_COOKIE,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        },
        account: {
            address: process.env.FRAGMENT_ACCOUNT_ADDRESS,
            chain: process.env.FRAGMENT_ACCOUNT_CHAIN || '-239',
            walletStateInit: process.env.FRAGMENT_ACCOUNT_WALLET_STATE_INIT,
            publicKey: process.env.FRAGMENT_ACCOUNT_PUBLIC_KEY
        },
        device: {
            platform: process.env.FRAGMENT_DEVICE_PLATFORM || 'mac',
            appName: process.env.FRAGMENT_DEVICE_APP_NAME || 'Tonkeeper',
            appVersion: process.env.FRAGMENT_DEVICE_APP_VERSION || '3.27.2',
            maxProtocolVersion: parseInt(process.env.FRAGMENT_DEVICE_MAX_PROTOCOL_VERSION) || 2,
            features: ['SendTransaction', {
                name: 'SendTransaction',
                maxMessages: 4,
                extraCurrenciesSupported: true
            }]
        }
    },
    db: {
        mongoUri: process.env.MONGODB_URI
    },
    tron: {
        network: process.env.TRON_NETWORK || 'mainnet',
        privateKey: process.env.TRON_PRIVATE_KEY,
        address: process.env.TRON_ADDRESS,
        apiKey: process.env.TRON_API_KEY
    },
    ton: {
        network: process.env.TON_NETWORK || 'mainnet',
        apiKey: process.env.TON_API_KEY,
        testnetApiKey: process.env.TON_TESTNET_API_KEY,
        mnemonic: process.env.TON_MNEMONIC
    },
    jwt: {
        secret: process.env.JWT_SECRET
    },
    server: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development'
    }
}; 