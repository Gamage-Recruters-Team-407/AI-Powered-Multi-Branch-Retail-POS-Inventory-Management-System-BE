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

// Global connection caching for serverless environments (Vercel / Lambda)
let cached = global.mongoose;
if (!cached) {
	cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
	const mongoUri = process.env.MONGO_URI;
	const dbName = process.env.DB_NAME || 'retail_pos_db';

	if (!mongoUri) {
		const msg = 'MONGO_URI environment variable is missing!';
		console.error(msg);
		throw new Error(msg);
	}

	if (cached.conn && mongoose.connection.readyState === 1) {
		return cached.conn;
	}

	if (!cached.promise) {
		const opts = {
			dbName,
			family: 4, // Force IPv4
			serverSelectionTimeoutMS: 10000,
			connectTimeoutMS: 10000,
			socketTimeoutMS: 45000,
		};

		cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
			console.log(`MongoDB Connected: ${m.connection.host}/${m.connection.name}`);
			return m.connection;
		});
	}

	try {
		cached.conn = await cached.promise;
	} catch (e) {
		cached.promise = null;
		console.error(`MongoDB connection failed: ${e.message}`);
		throw e;
	}

	return cached.conn;
};

module.exports = connectDB;
