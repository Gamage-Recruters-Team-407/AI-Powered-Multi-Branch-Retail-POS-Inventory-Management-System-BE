const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const { protect } = require('../middleware/authMiddleware');

/**
 * Dashboard Routes
 * All routes require authentication
 */

// Main dashboard statistics
router.get('/stats', protect, (req, res) => DashboardController.getDashboardStats(req, res));

// KPI summary cards
router.get('/kpis', protect, (req, res) => DashboardController.getKPISummary(req, res));

// Sales metrics and analytics
router.get('/sales', protect, (req, res) => DashboardController.getSalesMetrics(req, res));

// Sales trend data
router.get('/trends/sales', protect, (req, res) => DashboardController.getSalesTrend(req, res));

// Top products analysis
router.get('/top-products', protect, (req, res) => DashboardController.getTopProducts(req, res));

// Payment methods analysis
router.get('/payment-methods', protect, (req, res) => DashboardController.getPaymentMethods(req, res));

// Inventory metrics and status
router.get('/inventory', protect, (req, res) => DashboardController.getInventoryMetrics(req, res));

// Low stock alerts
router.get('/alerts/low-stock', protect, (req, res) => DashboardController.getLowStockAlerts(req, res));

// Employee performance metrics
router.get('/employees', protect, (req, res) => DashboardController.getEmployeeMetrics(req, res));

// Branch-specific dashboard
router.get('/branch/:branchId', protect, (req, res) => DashboardController.getBranchDashboard(req, res));

// Multi-branch comparison
router.get('/comparison', protect, (req, res) => DashboardController.getMultiBranchComparison(req, res));

// System health status
router.get('/health', protect, (req, res) => DashboardController.getSystemHealth(req, res));

// Export dashboard data
router.get('/export', protect, (req, res) => DashboardController.exportDashboardData(req, res));

module.exports = router;
