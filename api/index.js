const app = require('../src/app');
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');

module.exports = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (err) {
      console.error('Failed to connect to MongoDB in serverless function:', err);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Please ensure MONGO_URI is set correctly in Vercel environment variables and 0.0.0.0/0 is allowed in MongoDB Atlas Network Access.',
        error: err.message,
      });
    }
  }
  return app(req, res);
};
