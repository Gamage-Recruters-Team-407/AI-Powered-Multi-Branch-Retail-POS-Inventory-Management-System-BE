/**
 * Vercel serverless entry point.
 * Always awaits connectDB() at the start of each request — this is the
 * recommended pattern for serverless/Vercel deployments.
 * The connection is cached globally so it's reused across warm invocations.
 */

const app = require('../src/app');
const connectDB = require('../src/config/db');

module.exports = async (req, res) => {
  try {
    // Always await connection — safe to call on every request because
    // connectDB() returns the cached connection if already connected.
    await connectDB();
  } catch (err) {
    console.error('[Vercel] MongoDB connection failed:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Check MONGO_URI in Vercel Environment Variables and ensure 0.0.0.0/0 is allowed in MongoDB Atlas Network Access.',
      error: err.message,
    });
  }

  // Delegate to Express app
  return app(req, res);
};
