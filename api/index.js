const app = require('../src/app');
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');

module.exports = async (req, res) => {
  // Debug: log which MONGO_URI cluster is being used (masked for security)
  const uri = process.env.MONGO_URI || 'NOT SET';
  const maskedUri = uri !== 'NOT SET'
    ? uri.replace(/:([^@]+)@/, ':***@').substring(0, 80) + '...'
    : 'NOT SET';
  console.log(`[api/index.js] MONGO_URI: ${maskedUri}`);
  console.log(`[api/index.js] Mongoose readyState: ${mongoose.connection.readyState}`);

  if (mongoose.connection.readyState !== 1) {
    try {
      const conn = await connectDB();
      if (!conn || mongoose.connection.readyState !== 1) {
        throw new Error('Database connection incomplete (readyState is not 1).');
      }
      console.log(`[api/index.js] MongoDB connected successfully. Host: ${mongoose.connection.host}`);
    } catch (err) {
      console.error('[api/index.js] Failed to connect to MongoDB:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Please ensure MONGO_URI is set in Vercel Environment Variables and 0.0.0.0/0 is allowed in MongoDB Atlas Network Access.',
        error: err.message,
      });
    }
  }
  return app(req, res);
};
