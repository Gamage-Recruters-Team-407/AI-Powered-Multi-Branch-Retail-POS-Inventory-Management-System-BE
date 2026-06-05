const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { sendEmail } = require('../utils/emailSender');
const smsSender = require('../utils/smsSender');

const redisOptions = {
	maxRetriesPerRequest: null,
};

if (process.env.REDIS_TLS === 'true') {
	redisOptions.tls = {
		rejectUnauthorized: false,
	};
}

const connection = new IORedis(process.env.REDIS_URI, redisOptions);

const notificationWorker = new Worker(
	'NotificationQueue',
	async (job) => {
		const { type, recipient, content } = job.data;
		console.log(`[Worker] Processing background job ${job.id} - Type: ${type}`);

		try {
			if (type === 'EMAIL') {
				await sendEmail(
					recipient,
					content.subject,
					content.text,
				);
				console.log(`[Worker] Email successfully sent to ${recipient}`);
			} else if (type === 'SMS') {
				await smsSender.sendSMS(recipient, content.text);
				console.log(`[Worker] SMS successfully sent to ${recipient}`);
			}
		} catch (error) {
			console.error(`[Worker] Failed to process job ${job.id}:`, error);
			throw error;
		}
	},
	{ connection },
);

notificationWorker.on('completed', (job) => {
	console.log(`[Worker] Job ${job.id} completed!`);
});

notificationWorker.on('failed', (job, err) => {
	console.log(`[Worker] Job ${job.id} failed with error: ${err.message}`);
});

console.log('✅ BullMQ NotificationWorker is listening for jobs...');

module.exports = notificationWorker;
