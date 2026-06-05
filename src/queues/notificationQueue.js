const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisOptions = {
	maxRetriesPerRequest: null,
};

if (process.env.REDIS_TLS === 'true') {
	redisOptions.tls = {
		rejectUnauthorized: false,
	};
}

const connection = new IORedis(process.env.REDIS_URI, redisOptions);

const notificationQueue = new Queue('NotificationQueue', { connection });

console.log('✅ BullMQ NotificationQueue initialized');

module.exports = notificationQueue;
