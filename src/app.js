const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config();

const app = express();

// --- Middleware ---
// CORS එක first! (Meka wenas karanna epa, frontend port 5173 ekata meka one)
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Route Imports (Cleaned up duplicates) ---

// Core & Transaction Routes
const authRoutes = require('./routes/authRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const salesRoutes = require('./routes/salesRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const recommendationsRoutes = require('./routes/recommendations');

// AI & Analytics Routes
const chatRoutes = require('./routes/chat');
const nlqueryRoutes = require('./routes/nlquery');
const decisionsRoutes = require('./routes/decisions');

// Management & Master Data Routes
const userRoutes = require('./routes/userRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const branchRoutes = require('./routes/branchRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const returnsRoutes = require('./routes/returnsRoutes');
const reorderRoutes = require('./routes/reorderRoutes');

// Import routes from Tharsiga — Reporting Module
const reportRoutes = require('./routes/reportRoutes');

// --- API Routes (Cleaned up duplicates) ---

// Auth, Users & HR
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/customers', customerRoutes);

// Core Business, Inventory & POS
app.use('/api/branches', branchRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/reorders', reorderRoutes);

// AI, Analytics & Others
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);

// AI Features
app.use('/api/chat', chatRoutes);
app.use('/api/nlquery', nlqueryRoutes);
app.use('/api/decisions', decisionsRoutes);

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root Route
app.get('/', (req, res) => {
    res.json({ message: 'AI-Powered Multi-Branch Retail POS backend is running...' });
});

// Health Checks
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server running' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server running' });
});
// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        success: false,
        error: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

module.exports = app;