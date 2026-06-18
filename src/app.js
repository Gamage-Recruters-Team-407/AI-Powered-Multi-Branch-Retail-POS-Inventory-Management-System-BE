const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// ── Part 21: Audit & Security Middleware ───────────────────────────────────
const ipGuardMiddleware = require('./middleware/ipGuard');
const { auditMiddleware: autoAudit, rateLimitMiddleware } = require('./middleware/auditMiddleware');
const auditRoutes = require('./routes/auditRoutes');

// ── Core & Business Routes (Tharuka / Dev / All Branches) ──────────────────
const authRoutes = require('./routes/authRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const recommendationsRoutes = require('./routes/recommendations');
const chatRoutes = require('./routes/chat');
const nlqueryRoutes = require('./routes/nlquery');
const decisionsRoutes = require('./routes/decisions');

// Frontend එකෙන් ඉල්ලන (404 errors ආපු) ඉතිරි සියලුම Routes මවුන්ට් කිරීම
const employeeRoutes = require('./routes/employeeRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const branchRoutes = require('./routes/branchRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const returnsRoutes = require('./routes/returnsRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const salesRoutes = require('./routes/salesRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const reorderRoutes = require('./routes/reorderRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();

// Middleware & CORS settings (ඔයාගේ CLIENT_URL fallback එක සමඟ)
app.use(cors({
  origin: process.env.CLIENT_URL || process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 1. Global IP Guard ────────────────────────────────────────────────────
// Blacklist කරපු IP ලිස්ට් එකෙන් එන හොර Requests රූට්ස් වලට යන්න කලින්ම බ්ලොක් කරයි
app.use(ipGuardMiddleware);

// Static uploads ෆෝල්ඩරය පද්ධතියට සම්බන්ධ කිරීම (ඡායාරූප/ෆයිල්ස් සඳහා)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Default Routes & Health checks
app.get('/', (req, res) => {
  res.send('AI-Powered Multi-Branch Retail POS backend is running...');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server running' });
});

// ── 2. Auth Rate Limiter ──────────────────────────────────────────────────
app.use('/api/auth', rateLimitMiddleware({ windowMs: 15 * 60 * 1000, maxRequests: 20 }));

// ── 3. Auto-Audit Middleware ──────────────────────────────────────────────
app.use(autoAudit());

// ── Mount All Routes (Frontend එකෙන් ඉල්ලන endpoints සියල්ලම මෙතැනට දැම්මා) ──
app.use('/api/auth', authRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/nlquery', nlqueryRoutes);
app.use('/api/decisions', decisionsRoutes);

// Frontend Dashboard සහ අනෙකුත් මොඩියුල සඳහා අත්‍යවශ්‍ය මවුන්ට්ස්
app.use('/api/employees', employeeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reorders', reorderRoutes);
app.use('/api/analytics', analyticsRoutes);

// ── Part 21: Audit & Security Routes ─────────────────────────────────────
app.use('/api/audit', auditRoutes);

// 404 Route not found handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

module.exports = app;