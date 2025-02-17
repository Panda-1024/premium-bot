const { nanoid } = require('nanoid');
const moment = require('moment');
const Order = require('../../models/order');
const User = require('../../models/user');
const { Price } = require('../../models/price');
const { getConfig } = require('../../models/config');
const logger = require('../../utils/logger');

// 创建订单
const createOrder = async ({ userId, telegramId, duration }) => {
    try {
        // 检查用户
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        // 获取价格信息
        const priceInfo = await Price.findOne({ duration, isActive: true });
        if (!priceInfo) {
            throw new Error('套餐不存在或已下架');
        }

        // 计算实际支付金额（考虑折扣）
        let baseAmount = priceInfo.price * (1 - priceInfo.discount / 100);
        baseAmount = parseFloat(baseAmount.toFixed(3));

        // 检查是否有相同金额的待支付订单，如果有则生成稍微不同的金额
        const amount = await Order.generateUniqueAmount(baseAmount);

        // 获取系统配置的支付地址和超时时间
        const [paymentAddress, paymentTimeout] = await Promise.all([
            getConfig('PAYMENT_ADDRESS'),
            getConfig('PAYMENT_TIMEOUT')
        ]);

        if (!paymentAddress) {
            throw new Error('系统支付地址未配置');
        }

        // 创建订单
        const order = await Order.create({
            orderId: nanoid(),
            userId,
            telegramId,
            type: 'premium',
            duration,
            amount,
            paymentAddress,
            expireAt: moment().add(paymentTimeout || 30, 'minutes').toDate()
        });

        logger.info(`Created order ${order.orderId} for user ${telegramId}`);
        return order;
    } catch (error) {
        logger.error('Error creating order:', error);
        throw error;
    }
};

// 获取订单详情
const getOrderDetails = async (orderId) => {
    try {
        const order = await Order.findOne({ orderId });
        if (!order) {
            throw new Error('订单不存在');
        }
        return order;
    } catch (error) {
        logger.error(`Error getting order details for ${orderId}:`, error);
        throw error;
    }
};

// 取消订单
const cancelOrder = async (orderId, userId) => {
    try {
        const order = await Order.findOne({ orderId });
        if (!order) {
            throw new Error('订单不存在');
        }

        // 验证订单所有者
        if (order.userId.toString() !== userId.toString()) {
            throw new Error('无权操作此订单');
        }

        // 只能取消待支付的订单
        if (order.status !== 'pending') {
            throw new Error('订单状态不允许取消');
        }

        order.status = 'failed';
        order.failureReason = '用户取消';
        await order.save();

        return order;
    } catch (error) {
        logger.error(`Error canceling order ${orderId}:`, error);
        throw error;
    }
};

// 获取用户订单列表
const getUserOrders = async (userId, options = {}) => {
    try {
        const {
            status,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = -1
        } = options;

        const query = { userId };
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Order.countDocuments(query);

        return {
            orders,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        logger.error(`Error getting user orders for ${userId}:`, error);
        throw error;
    }
};

// 获取订单统计
const getOrderStats = async (userId) => {
    try {
        const stats = await Order.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$currency', 'TRX'] },
                                '$amount',
                                { $multiply: ['$amount', 100] } // 假设 1 USDT = 100 TRX
                            ]
                        }
                    }
                }
            }
        ]);

        return stats.reduce((acc, curr) => {
            acc[curr._id] = {
                count: curr.count,
                totalAmount: curr.totalAmount
            };
            return acc;
        }, {});
    } catch (error) {
        logger.error(`Error getting order stats for ${userId}:`, error);
        throw error;
    }
};

// 处理订单退款
const refundOrder = async (orderId, adminId) => {
    try {
        const order = await Order.findOne({ orderId });
        if (!order) {
            throw new Error('订单不存在');
        }

        // 验证管理员权限
        const admin = await User.findById(adminId);
        if (!admin || !admin.isAdmin) {
            throw new Error('无权执行此操作');
        }

        // 只能退款已支付的订单
        if (order.status !== 'paid' && order.status !== 'completed') {
            throw new Error('订单状态不允许退款');
        }

        // 更新订单状态
        order.status = 'refunded';
        await order.save();

        // 更新用户 Premium 状态
        const user = await User.findById(order.userId);
        if (user) {
            // 如果只有这一个订单，直接取消 Premium
            const otherActiveOrders = await Order.findOne({
                userId: user._id,
                status: 'completed',
                _id: { $ne: order._id }
            });

            if (!otherActiveOrders) {
                user.isPremium = false;
                user.premiumExpireDate = null;
                await user.save();
            }
        }

        return order;
    } catch (error) {
        logger.error(`Error refunding order ${orderId}:`, error);
        throw error;
    }
};

module.exports = {
    createOrder,
    getOrderDetails,
    cancelOrder,
    getUserOrders,
    getOrderStats,
    refundOrder
}; 