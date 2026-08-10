const mongoose = require('mongoose');

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
		console.log('Reusing existing MongoDB connection.');
		return mongoose.connection;
	}

	try {
		const conn = await mongoose.connect(mongoUri, {
			dbName,
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
