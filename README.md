# Telegram Premium 自助开通机器人

这是一个基于 Node.js 开发的 Telegram 机器人，用于自助开通 Telegram Premium 会员服务，支持 TRON 链上的 USDT 支付。

## 功能特点

- 自助开通 Telegram Premium
- 支持 USDT-TRC20 支付
- 实时订单状态更新
- 管理员后台统计
- 自动化处理流程

## 技术栈

- Node.js
- MongoDB
- Telegraf (Telegram Bot Framework)
- TronWeb
- Tonweb
- Docker

## 安装步骤

### 方式一：本地安装

1. 克隆项目
```bash
git clone https://github.com/Panda-1024/premium-bot.git
cd premium-bot
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置信息
```

4. 启动项目
```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

### 方式二：Docker 部署

1. 克隆项目并进入目录
```bash
git clone https://github.com/Panda-1024/premium-bot.git
cd premium-bot
```

2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置信息
```

3. 使用 Docker Compose 启动服务
```bash
# 构建并启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 环境变量说明

### Telegram Bot

- `BOT_TOKEN`: Telegram Bot Token，从 @BotFather 获取
- `ADMIN_USER_IDS`: 管理员用户 ID，多个用英文逗号分隔

### 代理配置（可选）

- `TELEGRAM_PROXY_ENABLED`: 是否启用代理
- `TELEGRAM_PROXY_TYPE`: 代理类型：http 或 socks5
- `TELEGRAM_PROXY_HOST`: 代理服务器地址
- `TELEGRAM_PROXY_PORT`: 代理服务器端口
- `TELEGRAM_PROXY_AUTH`: 是否需要代理认证
- `TELEGRAM_PROXY_USERNAME`: 代理用户名（如需认证）
- `TELEGRAM_PROXY_PASSWORD`: 代理密码（如需认证）

### Fragment API 配置(从fragment官网获取)

- `FRAGMENT_API_HASH`: Fragment API Hash
- `FRAGMENT_API_COOKIE`: Fragment API Cookie
- `FRAGMENT_ACCOUNT_ADDRESS`:  Fragment 账户地址
- `FRAGMENT_ACCOUNT_CHAIN`: Fragment 链 ID
- `FRAGMENT_ACCOUNT_WALLET_STATE_INIT`: Fragment 钱包初始化状态
- `FRAGMENT_ACCOUNT_PUBLIC_KEY`: Fragment 账户公钥
- `FRAGMENT_DEVICE_PLATFORM`: 设备平台
- `FRAGMENT_DEVICE_APP_NAME`: 应用名称
- `FRAGMENT_DEVICE_APP_VERSION`: 应用版本
- `FRAGMENT_DEVICE_MAX_PROTOCOL_VERSION`: 最大协议版本

### MongoDB 配置

- `MONGO_USER`: MongoDB 用户名
- `MONGO_PASSWORD`: MongoDB 密码
- `MONGODB_URI`: mongodb://premium_bot_user:your_strong_password@localhost:27017/premium-bot?authSource=admin

### TRON 网络配置

- `TRON_NETWORK`: TRON 网络类型：mainnet 或 testnet
- `TRON_PRIVATE_KEY`: TRON 钱包私钥
- `TRON_ADDRESS`: TRON 钱包地址
- `TRON_API_KEY`: TronGrid API Key

### TON 网络配置

- `TON_NETWORK`: TON 网络类型：mainnet 或 testnet
- `TON_API_KEY`: TON Center API Key（主网）
- `TON_TESTNET_API_KEY`: TON Center API Key（测试网）
- `TON_MNEMONIC`: TON 钱包助记词（24个单词）

## 目录结构

```text
src/
├── config/         # 配置文件
├── controllers/    # 控制器
├── models/         # 数据模型
├── services/       # 业务逻辑
│   ├── bot/       # 机器人服务
│   ├── blockchain/# 区块链服务
│   └── payment/   # 支付服务
├── middlewares/   # 中间件
└── utils/         # 工具函数
```

## Docker 容器说明

项目包含三个主要容器：

- `premium-bot`: Node.js 应用服务
- `premium-bot-mongodb`: MongoDB 数据库服务

数据持久化：

- MongoDB 数据存储在 `mongodb_data` 卷中
- 应用日志存储在宿主机的 `logs` 目录中

## 开发团队

[蓝胖子](https://t.me/lanpanzi)

## 打赏

如果该项目对您有所帮助，希望可以请我喝一杯咖啡☕️

```text
USDT-TRC20打赏地址: TQHEQHJRH4EGADUZsp6DytodC4jKM8tnGY
```
<img src="Wiki/imgs/tron-thanks.png" width = "400" alt="usdt扫码打赏"/>

## 声明

`premium-bot`为开源的产品，仅用于学习交流使用！
不可用于任何违反中华人民共和国(含台湾省)或使用者所在地区法律法规的用途。
因为作者即本人仅完成代码的开发和开源活动(开源即任何人都可以下载使用或修改分发)，从未参与用户的任何运营和盈利活动。
且不知晓用户后续将程序源代码用于何种用途，故用户使用过程中所带来的任何法律责任即由用户自己承担。
