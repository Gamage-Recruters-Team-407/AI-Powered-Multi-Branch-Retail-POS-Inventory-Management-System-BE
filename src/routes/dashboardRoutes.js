// const express = require('express');
// const router = express.Router();
// const DashboardController = require('../controllers/DashboardController');
// const { protect } = require('../middleware/authMiddleware');
// const TopProductsController = require('../controllers/topProductsController');

// /**
//  * Dashboard Routes
//  * All routes require authentication
//  */

// // Main dashboard statistics
// router.get('/stats', protect, (req, res) => DashboardController.getDashboardStats(req, res));

// // KPI summary cards
// router.get('/kpis', protect, (req, res) => DashboardController.getKPISummary(req, res));

// // Sales metrics and analytics
// router.get('/sales', protect, (req, res) => DashboardController.getSalesMetrics(req, res));

// // Sales trend data
// router.get('/trends/sales', protect, (req, res) => DashboardController.getSalesTrend(req, res));

// // Top products analysis
// router.get('/top-products', protect, (req, res) => DashboardController.getTopProducts(req, res));

// router.get(
//   '/top-products/report',
//   protect,
//   (req, res) => TopProductsController.getTopProductsReport(req, res)
// );

// router.get(
//   '/top-products-new',
//   protect,
//   (req, res) => TopProductsController.getTopProducts(req, res)
// );

// // Payment methods analysis
// router.get('/payment-methods', protect, (req, res) => DashboardController.getPaymentMethods(req, res));

// // Inventory metrics and status
// router.get('/inventory', protect, (req, res) => DashboardController.getInventoryMetrics(req, res));

// // Low stock alerts
// router.get('/alerts/low-stock', protect, (req, res) => DashboardController.getLowStockAlerts(req, res));

// // Employee performance metrics
// router.get('/employees', protect, (req, res) => DashboardController.getEmployeeMetrics(req, res));

// // Branch-specific dashboard
// router.get('/branch/:branchId', protect, (req, res) => DashboardController.getBranchDashboard(req, res));

// // Multi-branch comparison
// router.get('/comparison', protect, (req, res) => DashboardController.getMultiBranchComparison(req, res));

// // System health status
// router.get('/health', protect, (req, res) => DashboardController.getSystemHealth(req, res));

// // Export dashboard data
// router.get('/export', protect, (req, res) => DashboardController.exportDashboardData(req, res));



// module.exports = router;

const express = require("express");
const router = express.Router();
const DashboardController = require("../controllers/DashboardController");
const { protect, authorize } = require("../middleware/authMiddleware");
const TopProductsController = require("../controllers/topProductsController");

// ── Role shorthands ──────────────────────────────────────────────────────────
const adminOnly        = [protect, authorize("admin")];
const adminManager     = [protect, authorize("admin", "manager")];
const allStaff         = [protect, authorize("admin", "manager", "cashier")];

// ── Main dashboard stats ─────────────────────────────────────────────────────
router.get("/stats",           ...allStaff,     (req, res) => DashboardController.getDashboardStats(req, res));

// ── KPIs — admin + manager only ──────────────────────────────────────────────
router.get("/kpis",            ...adminManager, (req, res) => DashboardController.getKPISummary(req, res));

// ── Sales data — admin + manager only ────────────────────────────────────────
router.get("/sales",           ...adminManager, (req, res) => DashboardController.getSalesMetrics(req, res));
router.get("/trends/sales",    ...adminManager, (req, res) => DashboardController.getSalesTrend(req, res));

// ── Products — admin + manager only ──────────────────────────────────────────
router.get("/top-products",         ...adminManager, (req, res) => DashboardController.getTopProducts(req, res));
router.get("/top-products/report",  ...adminManager, (req, res) => TopProductsController.getTopProductsReport(req, res));
router.get("/top-products-new",     ...adminManager, (req, res) => TopProductsController.getTopProducts(req, res));

// ── Payments — admin + manager only ──────────────────────────────────────────
router.get("/payment-methods", ...adminManager, (req, res) => DashboardController.getPaymentMethods(req, res));

// ── Inventory — admin + manager only ─────────────────────────────────────────
router.get("/inventory",       ...adminManager, (req, res) => DashboardController.getInventoryMetrics(req, res));
router.get("/alerts/low-stock",...adminManager, (req, res) => DashboardController.getLowStockAlerts(req, res));

// ── Employees — admin + manager only ─────────────────────────────────────────
router.get("/employees",       ...adminManager, (req, res) => DashboardController.getEmployeeMetrics(req, res));

// ── Branch data — admin + manager only ───────────────────────────────────────
router.get("/branch/:branchId",...adminManager, (req, res) => DashboardController.getBranchDashboard(req, res));
router.get("/comparison",      ...adminManager, (req, res) => DashboardController.getMultiBranchComparison(req, res));

// ── System health — admin only ────────────────────────────────────────────────
router.get("/health",          ...adminOnly,    (req, res) => DashboardController.getSystemHealth(req, res));

// ── Export — admin only ───────────────────────────────────────────────────────
router.get("/export",          ...adminOnly,    (req, res) => DashboardController.exportDashboardData(req, res));

module.exports = router;