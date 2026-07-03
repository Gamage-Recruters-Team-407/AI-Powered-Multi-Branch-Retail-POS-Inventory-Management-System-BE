const DashboardService = require('../services/DashboardService');
const systemEvents = require('../events/eventBus');

class DashboardController {
  /**
   * Get comprehensive dashboard statistics
   * GET /api/dashboard/stats
   */
  async getDashboardStats(req, res) {
    try {
      const { startDate, endDate, branchId, includeEmployees, includeInventory, includeSales, includeForecast } = req.query;

      const options = {};

      if (startDate) {
        options.startDate = new Date(startDate);
      }

      if (endDate) {
        options.endDate = new Date(endDate);
      }

      if (branchId) {
        options.branchId = branchId;
      }

      options.includeEmployees = includeEmployees !== 'false';
      options.includeInventory = includeInventory !== 'false';
      options.includeSales = includeSales !== 'false';
      options.includeForecast = includeForecast !== 'false';

      const stats = await DashboardService.getDashboardStats(options);

      res.status(200).json({
        success: true,
        message: 'Dashboard statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving dashboard statistics',
        error: error.message,
      });
    }
  }

  /**
   * Get KPI summary cards data
   * GET /api/dashboard/kpis
   */
  async getKPISummary(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      res.status(200).json({
        success: true,
        message: 'KPI summary retrieved successfully',
        data: stats.kpis,
      });
    } catch (error) {
      console.error('KPI summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving KPI summary',
        error: error.message,
      });
    }
  }

  /**
   * Get sales metrics and trends
   * GET /api/dashboard/sales
   */
  async getSalesMetrics(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeEmployees: false,
        includeInventory: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      res.status(200).json({
        success: true,
        message: 'Sales metrics retrieved successfully',
        data: stats.sales,
      });
    } catch (error) {
      console.error('Sales metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving sales metrics',
        error: error.message,
      });
    }
  }

  /**
   * Get inventory status and metrics
   * GET /api/dashboard/inventory
   */
  async getInventoryMetrics(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeEmployees: false,
        includeSales: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      res.status(200).json({
        success: true,
        message: 'Inventory metrics retrieved successfully',
        data: stats.inventory,
      });
    } catch (error) {
      console.error('Inventory metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving inventory metrics',
        error: error.message,
      });
    }
  }

  /**
   * Get employee performance metrics
   * GET /api/dashboard/employees
   */
  async getEmployeeMetrics(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeSales: false,
        includeInventory: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      res.status(200).json({
        success: true,
        message: 'Employee metrics retrieved successfully',
        data: stats.employees,
      });
    } catch (error) {
      console.error('Employee metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving employee metrics',
        error: error.message,
      });
    }
  }

  /**
   * Get branch-specific dashboard
   * GET /api/dashboard/branch/:branchId
   */
  async getBranchDashboard(req, res) {
    try {
      const { branchId } = req.params;
      const { startDate, endDate } = req.query;

      const options = {};

      if (startDate) {
        options.startDate = new Date(startDate);
      }

      if (endDate) {
        options.endDate = new Date(endDate);
      }

      const branchDashboard = await DashboardService.getBranchDashboard(branchId, options);

      res.status(200).json({
        success: true,
        message: 'Branch dashboard retrieved successfully',
        data: branchDashboard,
      });
    } catch (error) {
      console.error('Branch dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving branch dashboard',
        error: error.message,
      });
    }
  }

  /**
   * Get multi-branch comparison data
   * GET /api/dashboard/comparison
   */
  async getMultiBranchComparison(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const options = {};

      if (startDate) {
        options.startDate = new Date(startDate);
      }

      if (endDate) {
        options.endDate = new Date(endDate);
      }

      const comparison = await DashboardService.getMultiBranchComparison(options);

      res.status(200).json({
        success: true,
        message: 'Branch comparison retrieved successfully',
        data: comparison,
      });
    } catch (error) {
      console.error('Branch comparison error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving branch comparison',
        error: error.message,
      });
    }
  }

  /**
   * Get sales trend data for chart visualization
   * GET /api/dashboard/trends/sales
   */
  async getSalesTrend(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeEmployees: false,
        includeInventory: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      const trendData = {
        labels: stats.sales.dailySales.map((day) => day._id),
        datasets: [
          {
            label: 'Revenue',
            data: stats.sales.dailySales.map((day) => day.revenue),
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            tension: 0.4,
          },
          {
            label: 'Transactions',
            data: stats.sales.dailySales.map((day) => day.transactions),
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            tension: 0.4,
          },
        ],
      };

      res.status(200).json({
        success: true,
        message: 'Sales trend data retrieved successfully',
        data: trendData,
      });
    } catch (error) {
      console.error('Sales trend error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving sales trend',
        error: error.message,
      });
    }
  }

  /**
   * Get top products analysis
   * GET /api/dashboard/top-products
   */
  async getTopProducts(req, res) {
    try {
      const { startDate, endDate, limit = 10, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeEmployees: false,
        includeInventory: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);
      const topProducts = stats.sales.topProducts.slice(0, parseInt(limit));

      const chartData = {
        labels: topProducts.map((product) => product.productName),
        datasets: [
          {
            label: 'Revenue',
            data: topProducts.map((product) => product.totalRevenue),
            backgroundColor: '#4CAF50',
          },
          {
            label: 'Quantity Sold',
            data: topProducts.map((product) => product.totalQuantity),
            backgroundColor: '#2196F3',
          },
        ],
      };

      res.status(200).json({
        success: true,
        message: 'Top products retrieved successfully',
        data: {
          chartData,
          products: topProducts,
        },
      });
    } catch (error) {
      console.error('Top products error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving top products',
        error: error.message,
      });
    }
  }

  /**
   * Get payment method analysis
   * GET /api/dashboard/payment-methods
   */
  async getPaymentMethods(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeEmployees: false,
        includeInventory: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      const chartData = {
        labels: stats.sales.paymentMethods.map((method) => method._id || 'Unknown'),
        datasets: [
          {
            label: 'Amount',
            data: stats.sales.paymentMethods.map((method) => method.amount),
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
          },
        ],
      };

      res.status(200).json({
        success: true,
        message: 'Payment method analysis retrieved successfully',
        data: {
          chartData,
          methods: stats.sales.paymentMethods,
        },
      });
    } catch (error) {
      console.error('Payment methods error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving payment method analysis',
        error: error.message,
      });
    }
  }

  /**
   * Get low stock alerts
   * GET /api/dashboard/alerts/low-stock
   */
  async getLowStockAlerts(req, res) {
    try {
      const { startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeSales: false,
        includeEmployees: false,
        includeForecast: false,
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      res.status(200).json({
        success: true,
        message: 'Low stock alerts retrieved successfully',
        data: stats.inventory.lowStockAlert,
      });
    } catch (error) {
      console.error('Low stock alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving low stock alerts',
        error: error.message,
      });
    }
  }

  /**
   * Get system health status
   * GET /api/dashboard/health
   */
  async getSystemHealth(req, res) {
    try {
      const stats = await DashboardService.getDashboardStats({
        includeForecast: false,
      });

      const healthStatus = {
        salesHealth: stats.kpis.salesGrowth > 0 ? 'Good' : 'Warning',
        inventoryHealth:
          stats.inventory.lowStockAlert.count < 10 ? 'Good' : 'Warning',
        employeeHealth:
          stats.employees.performanceMetrics.averageRating > 3 ? 'Good' : 'Warning',
        overallStatus: 'Operational',
        metrics: {
          revenue: stats.kpis.revenue,
          inventory: stats.inventory.totalItems,
          employees: stats.employees.activeEmployees,
          customers: stats.system.totalCustomers,
        },
      };

      res.status(200).json({
        success: true,
        message: 'System health status retrieved successfully',
        data: healthStatus,
      });
    } catch (error) {
      console.error('System health error:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving system health',
        error: error.message,
      });
    }
  }

  /**
   * Export dashboard data
   * GET /api/dashboard/export
   */
  async exportDashboardData(req, res) {
    try {
      const { format = 'json', startDate, endDate, branchId } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: endDate ? new Date(endDate) : new Date(),
      };

      if (branchId) {
        options.branchId = branchId;
      }

      const stats = await DashboardService.getDashboardStats(options);

      if (format === 'json') {
        systemEvents.emit('SEND_ALERT', {
          target: { role: 'Admin' },
          category: 'SYSTEM',
          type: 'WARNING',
          title: 'Data Exported',
          message: 'Dashboard metrics were exported as JSON.',
          channels: ['in-app'],
        });

        res.status(200).json({
          success: true,
          message: 'Dashboard data exported successfully',
          data: stats,
        });
      } else if (format === 'csv') {
        systemEvents.emit('SEND_ALERT', {
          target: { role: 'Admin' },
          category: 'SYSTEM',
          type: 'WARNING',
          title: 'Data Exported',
          message: 'Dashboard metrics were exported as CSV.',
          channels: ['in-app'],
        });

        // CSV export logic would go here
        res.status(200).send(JSON.stringify(stats, null, 2));
      } else {
        res.status(400).json({
          success: false,
          message: 'Unsupported export format',
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting dashboard data',
        error: error.message,
      });
    }
  }
}

module.exports = new DashboardController();
