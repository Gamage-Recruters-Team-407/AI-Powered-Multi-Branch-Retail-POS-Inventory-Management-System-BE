const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Connect to Redis using the URI from .env
const connection = new IORedis(process.env.REDIS_URI, {
    maxRetriesPerRequest: null,
});

// Create the Queue
const notificationQueue = new Queue('NotificationQueue', { connection });

console.log('✅ BullMQ NotificationQueue initialized');

module.exports = notificationQueue;
