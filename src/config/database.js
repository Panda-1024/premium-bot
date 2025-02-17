const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

// MongoDB 连接
const connectMongo = async () => {
    try {
        await mongoose.connect(config.db.mongoUri);
        logger.info('MongoDB connected successfully');
    } catch (error) {
        logger.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

module.exports = {
    connectMongo
}; 