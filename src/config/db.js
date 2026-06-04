const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;
    const dbName = process.env.DB_NAME || 'retail_pos_db';

    if (!mongoUri) {
        console.warn('MONGO_URI is missing. Server started without MongoDB.');
        return null;
    }

	try {
		if (mongoUri.startsWith('mongodb+srv://')) {
			const dnsServers = (process.env.MONGO_DNS_SERVERS || '8.8.8.8,1.1.1.1')
				.split(',')
				.map((server) => server.trim())
				.filter(Boolean);

			dns.setServers(dnsServers);
		}

		const conn = await mongoose.connect(mongoUri, {
			dbName,
			serverSelectionTimeoutMS: 8000,
		});

		console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
		return conn;
	} catch (error) {
		console.warn(`MongoDB connection failed: ${error.message}`);
		console.warn('Server will continue running, but MongoDB features are disabled.');
		return null;
	}
};

module.exports = connectDB;