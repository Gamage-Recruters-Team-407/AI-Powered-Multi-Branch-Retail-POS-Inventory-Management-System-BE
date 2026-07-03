const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

/**
 * Business Analytics Routes
 * All routes require authentication
 */

// Sales & Profit Trends
router.get('/sales-trends', protect, (req, res) => AnalyticsController.getSalesTrends(req, res));
router.get('/profit-trends', protect, (req, res) => AnalyticsController.getProfitTrends(req, res));

// Revenue Breakdown by category / payment / hour / dayOfWeek
router.get('/revenue-breakdown', protect, (req, res) => AnalyticsController.getRevenueBreakdown(req, res));

// Branch Performance & Rankings
router.get('/branch-performance', protect, (req, res) => AnalyticsController.getBranchPerformance(req, res));
router.get('/branch-rankings', protect, (req, res) => AnalyticsController.getBranchRankings(req, res));

// Drill-Down Analysis
router.get('/drill-down', protect, (req, res) => AnalyticsController.getDrillDown(req, res));
router.get('/drill-down/transactions', protect, (req, res) => AnalyticsController.getDrillDownTransactions(req, res));

// Product & Category Analytics
router.get('/product-performance', protect, (req, res) => AnalyticsController.getProductPerformance(req, res));
router.get('/category-analysis', protect, (req, res) => AnalyticsController.getCategoryAnalysis(req, res));

// Customer Insights
router.get('/customer-insights', protect, (req, res) => AnalyticsController.getCustomerInsights(req, res));

// KPI Summary & Trends
router.get('/kpi-summary', protect, (req, res) => AnalyticsController.getKPISummary(req, res));
router.get('/kpi-trends', protect, (req, res) => AnalyticsController.getKPITrends(req, res));

// Automated Insights
router.get('/insights', protect, (req, res) => AnalyticsController.getInsights(req, res));

// Chart Data (pre-formatted for frontend visualizations)
router.get('/chart-data', protect, (req, res) => AnalyticsController.getChartData(req, res));

// Export
router.get('/export', protect, (req, res) => AnalyticsController.exportAnalytics(req, res));

module.exports = router;
