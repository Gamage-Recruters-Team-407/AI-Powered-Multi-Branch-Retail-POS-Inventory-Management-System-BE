const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { sendEmail } = require('../utils/emailSender');
const smsSender = require('../utils/smsSender');

const redisUri = process.env.REDIS_URI;
let notificationWorker;

if (!redisUri) {
  console.warn('⚠️ REDIS_URI not configured. Notification worker is disabled.');
  notificationWorker = {
    on: () => {},
  };
} else {
  const connection = new IORedis(redisUri, {
    maxRetriesPerRequest: null,
  });

  connection.on('error', (error) => {
    // console.warn(`⚠️ Redis connection error for NotificationWorker: ${error.message}`);
  });

  notificationWorker = new Worker(
    'NotificationQueue',
    async (job) => {
      const { type, recipient, content } = job.data;

      try {
        if (type === 'EMAIL') {
          const success = await sendEmail(recipient, content.subject, content.text);
          // if (success) {
          //   console.log(`[Worker] Email successfully sent to ${recipient}`);
          // }
        } else if (type === 'SMS') {
          await smsSender.sendSMS(recipient, content.text);
          console.log(`[Worker] SMS successfully sent to ${recipient}`);
        }
      } catch (error) {
        console.error(`[Worker] Failed to process job ${job.id}:`, error);
        throw error;
      }
    },
    { connection }
  );

  notificationWorker.on('failed', (job, err) => {
    console.log(`[Worker] Job ${job.id} failed with error: ${err.message}`);
  });

  notificationWorker.on('error', () => {}); // Sink unhandled Redis reconnect errors

  console.log('✅ BullMQ NotificationWorker is listening for jobs...');
}

module.exports = notificationWorker;
