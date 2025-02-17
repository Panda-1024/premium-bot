const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        sparse: true,
        index: true
    },
    firstName: String,
    lastName: String,
    isPremium: {
        type: Boolean,
        default: false
    },
    premiumExpireDate: Date,
    balance: {
        trx: {
            type: Number,
            default: 0
        },
        usdt: {
            type: Number,
            default: 0
        }
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'banned'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastActivityAt: Date
}, {
    timestamps: true
});

userSchema.index({ isPremium: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User; 