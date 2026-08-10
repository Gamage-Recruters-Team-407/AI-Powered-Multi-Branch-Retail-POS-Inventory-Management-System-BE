const app = require('../src/app');
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');

module.exports = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      const conn = await connectDB();
      if (!conn || mongoose.connection.readyState !== 1) {
        throw new Error('Database connection incomplete (readyState is not 1).');
      }
    } catch (err) {
      console.error('Failed to connect to MongoDB in serverless function:', err);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Please ensure MONGO_URI environment variable is added to Vercel Project Settings and 0.0.0.0/0 is whitelisted in MongoDB Atlas Network Access.',
        error: err.message,
      });
    }
  }
  return app(req, res);
};
