const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
    duration: {
        type: Number,  // 订阅时长（月）
        required: true,
        unique: true,
        index: true
    },
    price: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0,  // 折扣百分比，0-100
        min: 0,
        max: 100
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    description: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const Price = mongoose.model('Price', priceSchema);

// 添加默认价格配置
const initializePrices = async () => {
    const defaultPrices = [
        {
            duration: 3,
            price: 14,
            discount: 0,
            description: '3个月套餐'
        },
        {
            duration: 6,
            price: 22,
            discount: 0,
            description: '6个月套餐'
        },
        {
            duration: 12,
            price: 40,
            discount: 0,
            description: '12个月套餐'
        }
    ];

    for (const price of defaultPrices) {
        await Price.findOneAndUpdate(
            { duration: price.duration },
            price,
            { upsert: true }
        );
    }
};

module.exports = {
    Price,
    initializePrices
}; 