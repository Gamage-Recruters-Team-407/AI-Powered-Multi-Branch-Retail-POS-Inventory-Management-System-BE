const path = require('path');
const dns = require('dns');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables early with full path resolve
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

// Avoid node 17+ localhost resolution issues (v6 vs v4)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = require('./app');
const connectDB = require('./config/db'); // Default function import

// Sockets & Handlers
const sockethandler = require('./sockets/sockethandler');
const { initNotificationSocket } = require('./sockets/notificationSockets');

// Background Services & Workers
require('./services/NotificationService'); // Initialize Notification Event Listeners
require('./workers/notificationWorker'); // BullMQ worker starts automatically
const { initInventoryAlertJob } = require('./jobs/inventoryAlertJob');
const { startSecurityJobs } = require('./jobs/securityScanJob');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// ── Port / Server Error Handling ───────────────────────────────────────────
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the old server or change PORT in .env.`);
    process.exit(1);
  }
  console.error(`❌ Server error: ${error.message}`);
  process.exit(1);
});

// ── Socket.io Setup with CORS configs ──────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
});

// Set global Io pointers
global.io = io;
app.set('io', io);

// Initialize Sockets
sockethandler(io);

// Dynamic check for initNotificationSocket function to prevent type crashes
if (typeof initNotificationSocket === 'function') {
  initNotificationSocket(io);
} else {
  console.log('⚠️ Warning: initNotificationSocket is not exported as named function, trying default...');
  const setupNotificationSockets = require('./sockets/notificationSockets');
  if (typeof setupNotificationSockets === 'function') setupNotificationSockets(io);
}

// ── Background Startup Services ────────────────────────────────────────────
const startBackgroundServices = async (dbConnection) => {
  if (!dbConnection) {
    console.warn('⚠️ Skipping database-backed startup jobs because MongoDB is not connected.');
    return;
  }

  try {
    // Seed essential employees if required
    const seedEmployees = require('./utils/seedEmployees');
    await seedEmployees();
    
    // Start standard cron jobs
    initInventoryAlertJob();

    // Start Part 21 Security Scan jobs
    startSecurityJobs();

    console.log('✅ All Background Services & Startup Jobs Initialized.');
  } catch (serviceError) {
    console.error('❌ Error starting background services:', serviceError.message);
  }
};

// ── Start Server & Listen ──────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log('================================================================');
  console.log('🚀 POS RETAIL SYSTEM SERVER RUNNING');
  console.log(`   Running Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Listening Port      : ${PORT}`);
  console.log(`   Healthcheck Route   : http://localhost:${PORT}/api/health`);
  console.log('================================================================');

  // Establish DB connection first
  const dbConnection = await connectDB();
  
  // Fire background processes
  await startBackgroundServices(dbConnection);
});

// ── Global Process Failure Handling ────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error(`[Process Error] Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});