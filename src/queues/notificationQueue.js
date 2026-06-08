const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisUri = process.env.REDIS_URI;
let notificationQueue;

if (!redisUri) {
  console.warn('⚠️ REDIS_URI not configured. Notification queue is disabled.');
  notificationQueue = {
    add: async () => {
      console.warn('⚠️ Notification queue disabled. Job discarded.');
    },
  };
} else {
  const connection = new IORedis(redisUri, {
    maxRetriesPerRequest: null,
  });

  connection.on('error', (error) => {
    // console.warn(`⚠️ Redis connection error for NotificationQueue: ${error.message}`);
  });

  notificationQueue = new Queue('NotificationQueue', { connection });
  notificationQueue.on('error', () => {}); // Sink unhandled Redis reconnect errors
  
  console.log('✅ BullMQ NotificationQueue initialized');
}

module.exports = notificationQueue;
