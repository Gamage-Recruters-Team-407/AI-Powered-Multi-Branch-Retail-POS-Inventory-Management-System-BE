const path = require('path');
const dns = require('dns');

// Trigger nodemon restart
require('dotenv').config({
    path: path.resolve(__dirname, '../.env'),
});

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = require('./app');
const connectDB = require('./config/db');
const sockethandler = require('./sockets/sockethandler');
const setupNotificationSockets = require('./sockets/notificationSockets');
const { initInventoryAlertJob } = require('./jobs/inventoryAlertJob');
require('./services/NotificationService'); // Initialize Notification Event Listeners
const { initScheduler } = require('./services/reportSchedulerService');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the old server or change PORT in .env.`);
        process.exit(1);
    }

    console.error(`Server error: ${error.message}`);
    process.exit(1);
});

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        credentials: true,
    },
});

global.io = io;
app.set('io', io);

sockethandler(io);
setupNotificationSockets(io);

if (process.env.ENABLE_NOTIFICATION_WORKER === 'true') {
    try {
        require('./workers/notificationWorker');
        console.log('✅ Notification worker started');
    } catch (error) {
        console.warn(`⚠️ Notification worker not started: ${error.message}`);
    }
} else {
    console.log('ℹ️ Notification worker disabled. Set ENABLE_NOTIFICATION_WORKER=true to enable it.');
}

const startBackgroundServices = async (dbConnection) => {
    if (!dbConnection) {
        console.warn('Skipping database-backed startup jobs because MongoDB is not connected.');
        return;
    }

    const seedEmployees = require('./utils/seedEmployees');

    await seedEmployees();
    initInventoryAlertJob();
    await initScheduler();
    console.log('✅ Report scheduler initialized');


};

server.listen(PORT, async () => {
<<<<<<< Updated upstream
    let mlStatus = 'Disconnected';
    let modelStatus = 'Not Loaded';
    const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';
=======
  console.log('================================================================');
  console.log('🚀 POS RETAIL SYSTEM SERVER RUNNING');
  console.log(`   Running Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Listening Port      : ${PORT}`);
  console.log(`   Healthcheck Route   : http://localhost:${PORT}/api/health`);
  
  try {
    const mlUrl = process.env.FLASK_API_URL || 'http://localhost:5001';
    const mlResponse = await axios.get(`${mlUrl}/health`, { timeout: 3000 });
    if (mlResponse.data && mlResponse.data.status === 'healthy') {
      console.log(`   ML Service          : Connected (${mlUrl})`);
      if (mlResponse.data.mongodb_status === 'connected') {
        console.log(`   Data Source         : MongoDB Live Connected`);
      } else if (mlResponse.data.model_loaded) {
        console.log(`   Model Status        : Loaded (recommendation_model.pkl)`);
      } else if (mlResponse.data.model_loaded === false) {
        console.log(`   Model Status        : Not Loaded (recommendation_model.pkl missing)`);
      } else {
        console.log(`   Data Source         : Unknown or Disconnected`);
      }
    } else {
      console.log(`   ML Service          : Unreachable (${mlUrl})`);
    }
  } catch (error) {
    console.log(`   ML Service          : Disconnected (${process.env.FLASK_API_URL || 'http://localhost:5001'})`);
  }
  
  console.log('================================================================');
>>>>>>> Stashed changes

    try {
        const axios = require('axios');
        const res = await axios.get(`${FLASK_API_URL}/health`, { timeout: 3000 });
        mlStatus = `Connected (${FLASK_API_URL})`;
        modelStatus = res.data.model_loaded ? 'Loaded (recommendation_model.pkl)' : 'Not Loaded';
    } catch (error) {
        if (error.response) {
            mlStatus = `Connected (${FLASK_API_URL})`;
            modelStatus = error.response.data?.model_loaded ? 'Loaded (recommendation_model.pkl)' : 'Not Loaded';
        } else {
            mlStatus = `Disconnected (${error.message})`;
        }
    }

    console.log('================================================================');
    console.log('POS RETAIL SYSTEM SERVER RUNNING');
    console.log(`Running Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`Listening Port      : ${PORT}`);
    console.log(`Healthcheck Route   : http://localhost:${PORT}/api/health`);
    console.log(`ML Service          : ${mlStatus}`);
    console.log(`Model Status        : ${modelStatus}`);
    console.log('================================================================');

    const dbConnection = await connectDB();
    await startBackgroundServices(dbConnection);
});

process.on('unhandledRejection', (err) => {
    console.error(`[Process Error] Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
});