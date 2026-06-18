const AnalyticsService = require('../services/analyticsService');

class AnalyticsController {
  /**
   * Sales & Profit Trends
   * GET /api/analytics/sales-trends
   */
  async getSalesTrends(req, res) {
    try {
      const { fromDate, toDate, branchId, granularity } = req.query;
      const data = await AnalyticsService.getSalesTrends({ fromDate, toDate, branchId, granularity });
      res.status(200).json({ success: true, message: 'Sales trends retrieved successfully', data });
    } catch (error) {
      console.error('Sales trends error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving sales trends', error: error.message });
    }
  }

  /**
   * Profit Trends
   * GET /api/analytics/profit-trends
   */
  async getProfitTrends(req, res) {
    try {
      const { fromDate, toDate, branchId, granularity } = req.query;
      const data = await AnalyticsService.getProfitTrends({ fromDate, toDate, branchId, granularity });
      res.status(200).json({ success: true, message: 'Profit trends retrieved successfully', data });
    } catch (error) {
      console.error('Profit trends error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving profit trends', error: error.message });
    }
  }

  /**
   * Revenue Breakdown
   * GET /api/analytics/revenue-breakdown
   */
  async getRevenueBreakdown(req, res) {
    try {
      const { fromDate, toDate, branchId, groupBy } = req.query;
      const data = await AnalyticsService.getRevenueBreakdown({ fromDate, toDate, branchId, groupBy });
      res.status(200).json({ success: true, message: 'Revenue breakdown retrieved successfully', data });
    } catch (error) {
      console.error('Revenue breakdown error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving revenue breakdown', error: error.message });
    }
  }

  /**
   * Branch Performance
   * GET /api/analytics/branch-performance
   */
  async getBranchPerformance(req, res) {
    try {
      const { fromDate, toDate, branchId } = req.query;
      const data = await AnalyticsService.getBranchPerformance({ fromDate, toDate, branchId });
      res.status(200).json({ success: true, message: 'Branch performance retrieved successfully', data });
    } catch (error) {
      console.error('Branch performance error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving branch performance', error: error.message });
    }
  }

  /**
   * Branch Rankings
   * GET /api/analytics/branch-rankings
   */
  async getBranchRankings(req, res) {
    try {
      const { fromDate, toDate, branchId, metric } = req.query;
      const data = await AnalyticsService.getBranchRankings({ fromDate, toDate, branchId, metric });
      res.status(200).json({ success: true, message: 'Branch rankings retrieved successfully', data });
    } catch (error) {
      console.error('Branch rankings error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving branch rankings', error: error.message });
    }
  }

  /**
   * Drill-Down Analysis
   * GET /api/analytics/drill-down
   */
  async getDrillDown(req, res) {
    try {
      const { fromDate, toDate, branchId, groupBy, page, limit } = req.query;
      const data = await AnalyticsService.getDrillDown({
        fromDate, toDate, branchId, groupBy,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });
      res.status(200).json({ success: true, message: 'Drill-down data retrieved successfully', data });
    } catch (error) {
      console.error('Drill-down error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving drill-down data', error: error.message });
    }
  }

  /**
   * Drill-Down Transactions – view transactions within a group
   * GET /api/analytics/drill-down/transactions
   */
  async getDrillDownTransactions(req, res) {
    try {
      const { groupBy, groupValue, fromDate, toDate, branchId, page, limit } = req.query;
      if (!groupBy || !groupValue) {
        return res.status(400).json({ success: false, message: 'groupBy and groupValue are required' });
      }
      const data = await AnalyticsService.getDrillDownTransactions({
        groupBy, groupValue, fromDate, toDate, branchId,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
      res.status(200).json({ success: true, message: 'Drill-down transactions retrieved successfully', data });
    } catch (error) {
      console.error('Drill-down transactions error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving drill-down transactions', error: error.message });
    }
  }

  /**
   * Product Performance
   * GET /api/analytics/product-performance
   */
  async getProductPerformance(req, res) {
    try {
      const { fromDate, toDate, branchId, sortBy, page, limit } = req.query;
      const data = await AnalyticsService.getProductPerformance({
        fromDate, toDate, branchId, sortBy,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
      res.status(200).json({ success: true, message: 'Product performance retrieved successfully', data });
    } catch (error) {
      console.error('Product performance error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving product performance', error: error.message });
    }
  }

  /**
   * Category Analysis
   * GET /api/analytics/category-analysis
   */
  async getCategoryAnalysis(req, res) {
    try {
      const { fromDate, toDate, branchId } = req.query;
      const data = await AnalyticsService.getCategoryAnalysis({ fromDate, toDate, branchId });
      res.status(200).json({ success: true, message: 'Category analysis retrieved successfully', data });
    } catch (error) {
      console.error('Category analysis error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving category analysis', error: error.message });
    }
  }

  /**
   * Customer Insights
   * GET /api/analytics/customer-insights
   */
  async getCustomerInsights(req, res) {
    try {
      const { fromDate, toDate, branchId } = req.query;
      const data = await AnalyticsService.getCustomerInsights({ fromDate, toDate, branchId });
      res.status(200).json({ success: true, message: 'Customer insights retrieved successfully', data });
    } catch (error) {
      console.error('Customer insights error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving customer insights', error: error.message });
    }
  }

  /**
   * KPI Summary
   * GET /api/analytics/kpi-summary
   */
  async getKPISummary(req, res) {
    try {
      const { fromDate, toDate, branchId } = req.query;
      const data = await AnalyticsService.getKPISummary({ fromDate, toDate, branchId });
      res.status(200).json({ success: true, message: 'KPI summary retrieved successfully', data });
    } catch (error) {
      console.error('KPI summary error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving KPI summary', error: error.message });
    }
  }

  /**
   * KPI Trends
   * GET /api/analytics/kpi-trends
   */
  async getKPITrends(req, res) {
    try {
      const { fromDate, toDate, branchId } = req.query;
      const data = await AnalyticsService.getKPITrends({ fromDate, toDate, branchId });
      res.status(200).json({ success: true, message: 'KPI trends retrieved successfully', data });
    } catch (error) {
      console.error('KPI trends error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving KPI trends', error: error.message });
    }
  }

  /**
   * Analytical Insights
   * GET /api/analytics/insights
   */
  async getInsights(req, res) {
    try {
      const { fromDate, toDate, branchId } = req.query;
      const data = await AnalyticsService.getInsights({ fromDate, toDate, branchId });
      res.status(200).json({ success: true, message: 'Analytical insights retrieved successfully', data });
    } catch (error) {
      console.error('Insights error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving insights', error: error.message });
    }
  }

  /**
   * Chart Data – pre-formatted for frontend visualizations
   * GET /api/analytics/chart-data
   */
  async getChartData(req, res) {
    try {
      const { fromDate, toDate, branchId, chartType } = req.query;
      const data = await AnalyticsService.getChartData({ fromDate, toDate, branchId, chartType: chartType || 'revenue' });
      res.status(200).json({ success: true, message: 'Chart data retrieved successfully', data });
    } catch (error) {
      console.error('Chart data error:', error);
      res.status(500).json({ success: false, message: 'Error retrieving chart data', error: error.message });
    }
  }

  /**
   * Export Analytics
   * GET /api/analytics/export
   */
  async exportAnalytics(req, res) {
    try {
      const { fromDate, toDate, branchId, sections } = req.query;
      const sectionList = sections ? sections.split(',') : null;
      const data = await AnalyticsService.exportAnalytics({ fromDate, toDate, branchId, sections: sectionList });
      res.status(200).json({ success: true, message: 'Analytics data exported successfully', data });
    } catch (error) {
      console.error('Export analytics error:', error);
      res.status(500).json({ success: false, message: 'Error exporting analytics data', error: error.message });
    }
  }
}

module.exports = new AnalyticsController();
