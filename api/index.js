const app = require('../src/app');
const connectDB = require('../src/config/db');

let isConnected = false;

module.exports = async (req, res) => {
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
    } catch (err) {
      console.error('Failed to connect to MongoDB in serverless function:', err);
    }
  }
  return app(req, res);
};
