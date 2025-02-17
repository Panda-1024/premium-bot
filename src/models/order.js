const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['premium'],
        default: 'premium'
    },
    duration: {
        type: Number,  // 订阅时长（月）
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentAddress: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'completed', 'failed', 'expired', 'refunded'],
        default: 'pending',
        index: true
    },
    transactionHash: String,  // USDT 交易哈希
    tonTransactionHash: String,  // TON 交易哈希
    expireAt: {
        type: Date,
        required: true,
        index: true
    },
    completedAt: Date,
    failureReason: String
}, {
    timestamps: true
});

orderSchema.index({ createdAt: 1 });

// 静态方法：检查是否有相同金额的待支付订单
orderSchema.statics.findPendingOrderWithAmount = async function(amount) {
    return this.findOne({
        status: 'pending',
        amount: amount,
        expireAt: { $gt: new Date() }
    });
};

// 静态方法：生成稍微不同的金额
orderSchema.statics.generateUniqueAmount = async function(baseAmount) {
    const increment = 0.001;
    let amount = baseAmount;
    let existingOrder;
    
    do {
        amount = parseFloat((amount + increment).toFixed(3));
        existingOrder = await this.findPendingOrderWithAmount(amount);
    } while (existingOrder);

    return amount;
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order; 