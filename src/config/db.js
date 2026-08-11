const mongoose = require('mongoose');
const dns = require('dns');

// Fix Node.js DNS resolution order for Windows and Vercel/Lambda serverless
if (dns.setDefaultResultOrder) {
	try {
		dns.setDefaultResultOrder('ipv4first');
	} catch (_) {}
}

// Force Google/Cloudflare DNS to fix SRV lookup failures on serverless environments
try {
	dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}

mongoose.set('strictQuery', false);

let isConnected = false;

const connectDB = async () => {
	const mongoUri = process.env.MONGO_URI;
	const dbName = process.env.DB_NAME || 'retail_pos_db';

	if (!mongoUri) {
		const msg = 'MONGO_URI environment variable is missing!';
		console.error(msg);
		throw new Error(msg);
	}

	// Reuse existing connection (critical for serverless - Vercel/Lambda warm instances)
	if (isConnected && mongoose.connection.readyState === 1) {
		return mongoose.connection;
	}

	try {
		const conn = await mongoose.connect(mongoUri, {
			dbName,
			family: 4, // Force IPv4 to prevent IPv6 DNS hangs on Vercel/Atlas
			serverSelectionTimeoutMS: 10000,
			connectTimeoutMS: 10000,
			socketTimeoutMS: 45000,
		});

		isConnected = true;
		console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
		return conn;
	} catch (error) {
		isConnected = false;
		console.error(`MongoDB connection failed: ${error.message}`);
		throw error;
	}
};

module.exports = connectDB;
