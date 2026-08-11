/**
 * Serverless-safe MongoDB connection manager.
 * Uses a global cached connection to reuse connections across
 * Vercel function invocations (hot reloads & warm instances).
 */

const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'retail_pos_db';

// Use global to maintain connection cache across serverless function invocations
if (!global._mongooseCache) {
  global._mongooseCache = { conn: null, promise: null };
}
const cached = global._mongooseCache;

const connectDB = async () => {
  if (!MONGODB_URI) {
    throw new Error(
      'MONGO_URI environment variable is missing. ' +
      'Add it in Vercel Project Settings → Environment Variables.'
    );
  }

  // Return cached connection immediately if available
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If a connection promise is in flight, wait for it (prevents duplicate connections)
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: DB_NAME,
        bufferCommands: false, // Fail fast if connection drops instead of hanging
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10, // Maintain up to 10 connections in pool
      })
      .then((mongoose) => {
        console.log(`MongoDB Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
        return mongoose;
      })
      .catch((err) => {
        cached.promise = null; // Reset so next request retries
        console.error(`MongoDB connection failed: ${err.message}`);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};

module.exports = connectDB;
