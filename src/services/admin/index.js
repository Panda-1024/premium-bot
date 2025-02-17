const User = require('../../models/user');
const Order = require('../../models/order');
const { Price } = require('../../models/price');
const logger = require('../../utils/logger');
const moment = require('moment');

// 用户管理
const userManagement = {
    // 搜索用户
    async searchUser(query) {
        try {
            const user = await User.findOne({
                $or: [
                    { telegramId: parseInt(query) || 0 },
                    { username: new RegExp(query, 'i') }
                ]
            });
            return user;
        } catch (error) {
            logger.error('Error searching user:', error);
            throw error;
        }
    },

    // 封禁/解封用户
    async toggleUserBan(userId, adminId) {
        try {
            const user = await User.findById(userId);
            const admin = await User.findById(adminId);

            if (!admin.isAdmin) {
                throw new Error('无权执行此操作');
            }

            user.status = user.status === 'active' ? 'banned' : 'active';
            await user.save();

            return user;
        } catch (error) {
            logger.error('Error toggling user ban:', error);
            throw error;
        }
    },

    // 设置管理员权限
    async setAdminRole(userId, adminId, isAdmin) {
        try {
            const user = await User.findById(userId);
            const admin = await User.findById(adminId);

            if (!admin.isAdmin) {
                throw new Error('无权执行此操作');
            }

            user.isAdmin = isAdmin;
            await user.save();

            return user;
        } catch (error) {
            logger.error('Error setting admin role:', error);
            throw error;
        }
    }
};

// 订单管理
const orderManagement = {
    // 搜索订单
    async searchOrder(query) {
        try {
            const order = await Order.findOne({
                $or: [
                    { orderId: query },
                    { telegramId: parseInt(query) || 0 }
                ]
            }).populate('userId');
            return order;
        } catch (error) {
            logger.error('Error searching order:', error);
            throw error;
        }
    },

    // 获取异常订单
    async getProblemOrders() {
        try {
            return await Order.find({
                $or: [
                    { status: 'failed' },
                    {
                        status: 'pending',
                        expireAt: { $lt: new Date() }
                    }
                ]
            }).populate('userId').sort({ createdAt: -1 });
        } catch (error) {
            logger.error('Error getting problem orders:', error);
            throw error;
        }
    },

    // 处理退款
    async handleRefund(orderId, adminId, reason) {
        try {
            const admin = await User.findById(adminId);
            if (!admin.isAdmin) {
                throw new Error('无权执行此操作');
            }

            const order = await Order.findOne({ orderId });
            if (!order) {
                throw new Error('订单不存在');
            }

            order.status = 'refunded';
            order.failureReason = reason;
            await order.save();

            // 更新用户 Premium 状态
            const user = await User.findById(order.userId);
            if (user) {
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
            logger.error('Error handling refund:', error);
            throw error;
        }
    }
};

// 价格管理
const priceManagement = {
    // 添加套餐
    async addPrice(priceData, adminId) {
        try {
            const admin = await User.findById(adminId);
            if (!admin.isAdmin) {
                throw new Error('无权执行此操作');
            }

            const price = await Price.create(priceData);
            return price;
        } catch (error) {
            logger.error('Error adding price:', error);
            throw error;
        }
    },

    // 更新套餐
    async updatePrice(priceId, priceData, adminId) {
        try {
            const admin = await User.findById(adminId);
            if (!admin.isAdmin) {
                throw new Error('无权执行此操作');
            }

            const price = await Price.findByIdAndUpdate(priceId, priceData, { new: true });
            return price;
        } catch (error) {
            logger.error('Error updating price:', error);
            throw error;
        }
    },

    // 删除套餐
    async deletePrice(priceId, adminId) {
        try {
            const admin = await User.findById(adminId);
            if (!admin.isAdmin) {
                throw new Error('无权执行此操作');
            }

            await Price.findByIdAndDelete(priceId);
            return true;
        } catch (error) {
            logger.error('Error deleting price:', error);
            throw error;
        }
    }
};

// 统计功能
const statistics = {
    // 获取每日报表
    async getDailyReport(date = new Date()) {
        try {
            const startOfDay = moment(date).startOf('day').toDate();
            const endOfDay = moment(date).endOf('day').toDate();

            const [userStats, orderStats] = await Promise.all([
                User.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: startOfDay, $lte: endOfDay }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            newUsers: { $sum: 1 },
                            newPremiumUsers: {
                                $sum: { $cond: [{ $eq: ['$isPremium', true] }, 1, 0] }
                            }
                        }
                    }
                ]),
                Order.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: startOfDay, $lte: endOfDay }
                        }
                    },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                            totalAmount: {
                                $sum: {
                                    $cond: [
                                        { $eq: ['$currency', 'TRX'] },
                                        '$amount',
                                        { $multiply: ['$amount', 100] }
                                    ]
                                }
                            }
                        }
                    }
                ])
            ]);

            return {
                date: date,
                users: userStats[0] || { newUsers: 0, newPremiumUsers: 0 },
                orders: orderStats
            };
        } catch (error) {
            logger.error('Error getting daily report:', error);
            throw error;
        }
    },

    // 获取收入统计
    async getIncomeStats(startDate, endDate) {
        try {
            return await Order.aggregate([
                {
                    $match: {
                        status: { $in: ['completed', 'paid'] },
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            currency: '$currency'
                        },
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { '_id.date': 1 }
                }
            ]);
        } catch (error) {
            logger.error('Error getting income stats:', error);
            throw error;
        }
    }
};

module.exports = {
    userManagement,
    orderManagement,
    priceManagement,
    statistics
}; 