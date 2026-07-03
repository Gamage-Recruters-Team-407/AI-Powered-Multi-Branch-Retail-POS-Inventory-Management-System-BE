const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const {
    getSummary,
    getSalesReport,
    getInventoryReport,
    getBranchPerformance,
    getReportHistory,
    getScheduledReports,
    createScheduledReport,
    updateScheduledReport,
    deleteScheduledReport,
    exportPDF,
    exportExcel,
} = require('../controllers/reportController');

// ─────────────────────────────────────────────────────────────
// MongoDB connection guard — warns but allows fallback logic
// ─────────────────────────────────────────────────────────────
const requireMongoConnection = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        req.mongoUnavailable = true;
    }
    next();
};

// ─────────────────────────────────────────────────────────────
// AUTH NOTE:
// authMiddleware (protect/authorize) is available but kept optional
// for now to avoid blocking the module during team integration.
// Add back once Auth team confirms middleware is stable:
//   const { protect, authorize } = require('../middleware/authMiddleware');
//   router.get('/summary', protect, authorize('admin', 'manager'), getSummary);
// ─────────────────────────────────────────────────────────────

// ── Report Data Endpoints ──────────────────────────────────────
// GET /api/reports/summary
router.get('/summary', requireMongoConnection, getSummary);

// GET /api/reports/sales
router.get('/sales', requireMongoConnection, getSalesReport);

// GET /api/reports/inventory
router.get('/inventory', requireMongoConnection, getInventoryReport);

// GET /api/reports/branch-performance
router.get('/branch-performance', requireMongoConnection, getBranchPerformance);

// GET /api/reports/history
router.get('/history', requireMongoConnection, getReportHistory);

// ── Scheduled Reports CRUD ─────────────────────────────────────
// GET  /api/reports/scheduled           → list all schedules
router.get('/scheduled', requireMongoConnection, getScheduledReports);

// POST /api/reports/scheduled           → create new schedule + register cron
router.post('/scheduled', requireMongoConnection, createScheduledReport);

// PATCH /api/reports/scheduled/:id      → update schedule (toggle active, rename, etc.)
router.patch('/scheduled/:id', requireMongoConnection, updateScheduledReport);

// DELETE /api/reports/scheduled/:id     → delete schedule + stop cron task
router.delete('/scheduled/:id', requireMongoConnection, deleteScheduledReport);

// ── Export Endpoints ───────────────────────────────────────────
// POST /api/reports/export/pdf
router.post('/export/pdf', exportPDF);

// POST /api/reports/export/excel
router.post('/export/excel', exportExcel);

module.exports = router;
