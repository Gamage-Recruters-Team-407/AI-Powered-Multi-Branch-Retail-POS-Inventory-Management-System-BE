const Sale = require('../models/Sale');
const Inventory = require('../models/Inventory');
const Employee = require('../models/User');
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const EmployeePerformance = require('../models/EmployeePerformance');
const EmployeeAttendance = require('../models/EmployeeAttendance');
const Forecast = require('../models/Forecast');

class DashboardService {
  /**
   * Get aggregated dashboard statistics for a specific period and branches
   * @param {Object} options - Filter options (dates, branches, etc.)
   * @returns {Promise<Object>} - Aggregated dashboard data
   */
  async getDashboardStats(options = {}) {
    try {
      const {
        startDate = new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate = new Date(),
        branchId = null,
        includeEmployees = true,
        includeInventory = true,
        includeSales = true,
        includeForecast = true,
      } = options;

      const filterQuery = {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      if (branchId) {
        filterQuery.branchId = branchId;
      }

      // Parallel execution for better performance
      const [salesStats, inventoryStats, employeeStats, systemStats] = await Promise.all([
        includeSales ? this.calculateSalesMetrics(filterQuery) : Promise.resolve({}),
        includeInventory ? this.calculateInventoryMetrics(filterQuery) : Promise.resolve({}),
        includeEmployees ? this.calculateEmployeeMetrics(filterQuery) : Promise.resolve({}),
        this.calculateSystemMetrics(filterQuery),
      ]);

      const kpis = this.calculateKPIs({
        salesStats,
        inventoryStats,
        employeeStats,
      });

      return {
        timestamp: new Date(),
        period: {
          startDate,
          endDate,
        },
        sales: salesStats,
        inventory: inventoryStats,
        employees: employeeStats,
        system: systemStats,
        kpis,
        summary: this.generateSummary(salesStats, inventoryStats, employeeStats, kpis),
      };
    } catch (error) {
      throw new Error(`Error calculating dashboard statistics: ${error.message}`);
    }
  }

  /**
   * Calculate sales-related metrics
   */
  async calculateSalesMetrics(filterQuery) {
    try {
      const salesData = await Sale.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalTransactions: { $sum: 1 },
            averageTransactionValue: { $avg: '$totalAmount' },
            totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
            totalTax: { $sum: { $ifNull: ['$taxAmount', 0] } },
          },
        },
      ]);

      const dailySalesData = await Sale.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            revenue: { $sum: '$totalAmount' },
            transactions: { $sum: 1 },
            avgValue: { $avg: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const paymentMethodStats = await Sale.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            amount: { $sum: '$totalAmount' },
          },
        },
      ]);

      const topProducts = await Sale.aggregate([
        { $match: filterQuery },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
            productName: { $first: '$items.productName' },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
      ]);

      return {
        totalRevenue: salesData[0]?.totalRevenue || 0,
        totalTransactions: salesData[0]?.totalTransactions || 0,
        averageTransactionValue: salesData[0]?.averageTransactionValue || 0,
        totalDiscount: salesData[0]?.totalDiscount || 0,
        totalTax: salesData[0]?.totalTax || 0,
        netRevenue: (salesData[0]?.totalRevenue || 0) - (salesData[0]?.totalDiscount || 0),
        dailySales: dailySalesData,
        paymentMethods: paymentMethodStats,
        topProducts,
        growthTrend: this.calculateGrowthTrend(dailySalesData),
      };
    } catch (error) {
      console.error('Error calculating sales metrics:', error);
      return {};
    }
  }

  /**
   * Calculate inventory-related metrics
   */
  async calculateInventoryMetrics(filterQuery) {
    try {
      const inventoryData = await Inventory.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product',
          },
        },
        {
          $group: {
            _id: null,
            totalItems: { $sum: '$quantity' },
            totalValue: { $sum: { $multiply: ['$quantity', { $arrayElemAt: ['$product.price', 0] }] } },
            averagePrice: { $avg: { $arrayElemAt: ['$product.price', 0] } },
          },
        },
      ]);

      const lowStockItems = await Inventory.find(
        { quantity: { $lt: 20 } },
        { productId: 1, quantity: 1, reorderLevel: 1 }
      )
        .limit(15)
        .sort({ quantity: 1 });

      const stockMovementData = await StockMovement.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: '$movementType',
            count: { $sum: 1 },
            totalQuantity: { $sum: '$quantity' },
          },
        },
      ]);

      const inventoryTurnover = await this.calculateInventoryTurnover(filterQuery);

      const branchStockStatus = await Inventory.aggregate([
        {
          $group: {
            _id: '$branchId',
            totalItems: { $sum: '$quantity' },
            productCount: { $sum: 1 },
            avgStockLevel: { $avg: '$quantity' },
          },
        },
        {
          $lookup: {
            from: 'branches',
            localField: '_id',
            foreignField: '_id',
            as: 'branch',
          },
        },
        { $limit: 20 },
      ]);

      return {
        totalItems: inventoryData[0]?.totalItems || 0,
        totalValue: inventoryData[0]?.totalValue || 0,
        averagePrice: inventoryData[0]?.averagePrice || 0,
        lowStockAlert: {
          count: lowStockItems.length,
          items: lowStockItems,
        },
        stockMovement: stockMovementData,
        inventoryTurnover,
        branchStockStatus,
        stockHealth: this.calculateStockHealth(inventoryData, lowStockItems),
      };
    } catch (error) {
      console.error('Error calculating inventory metrics:', error);
      return {};
    }
  }

  /**
   * Calculate employee-related metrics
   */
  async calculateEmployeeMetrics(filterQuery) {
    try {
      const employeeData = await Employee.aggregate([
        { $match: { role: { $in: ['CASHIER', 'MANAGER', 'EMPLOYEE', 'cashier', 'manager', 'employee'] } } },
        {
          $group: {
            _id: null,
            totalEmployees: { $sum: 1 },
            activeEmployees: {
              $sum: {
                $cond: [{ $eq: ['$isActive', true] }, 1, 0],
              },
            },
            inactiveEmployees: {
              $sum: {
                $cond: [{ $eq: ['$isActive', false] }, 1, 0],
              },
            },
          },
        },
      ]);

      const attendanceData = await EmployeeAttendance.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            presentDays: {
              $sum: {
                $cond: [{ $eq: ['$status', 'present'] }, 1, 0],
              },
            },
            absentDays: {
              $sum: {
                $cond: [{ $eq: ['$status', 'absent'] }, 1, 0],
              },
            },
            lateDays: {
              $sum: {
                $cond: [{ $eq: ['$status', 'late'] }, 1, 0],
              },
            },
          },
        },
      ]);

      const performanceData = await EmployeePerformance.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            avgProductivity: { $avg: '$productivityScore' },
            avgAttendance: { $avg: '$attendanceScore' },
          },
        },
      ]);

      const topPerformers = await EmployeePerformance.find(filterQuery)
        .sort({ rating: -1 })
        .limit(10)
        .populate('employeeId', 'name email department');

      const departmentBreakdown = await Employee.aggregate([
        { $match: { role: { $in: ['CASHIER', 'MANAGER', 'EMPLOYEE', 'cashier', 'manager', 'employee'] } } },
        {
          $group: {
            _id: { $ifNull: ['$role', '$department'] },
            count: { $sum: 1 },
            avgSalary: { $avg: '$salary' },
          },
        },
      ]);

      return {
        totalEmployees: employeeData[0]?.totalEmployees || 0,
        activeEmployees: employeeData[0]?.activeEmployees || 0,
        inactiveEmployees: employeeData[0]?.inactiveEmployees || 0,
        attendanceData: {
          present: attendanceData[0]?.presentDays || 0,
          absent: attendanceData[0]?.absentDays || 0,
          late: attendanceData[0]?.lateDays || 0,
          attendanceRate:
            attendanceData[0]?.totalRecords > 0
              ? ((attendanceData[0]?.presentDays || 0) / attendanceData[0]?.totalRecords * 100).toFixed(2)
              : 0,
        },
        performanceMetrics: {
          averageRating: performanceData[0]?.avgRating || 0,
          averageProductivity: performanceData[0]?.avgProductivity || 0,
          averageAttendanceScore: performanceData[0]?.avgAttendance || 0,
        },
        topPerformers,
        departmentBreakdown,
      };
    } catch (error) {
      console.error('Error calculating employee metrics:', error);
      return {};
    }
  }

  /**
   * Calculate system-wide metrics
   */
  async calculateSystemMetrics(filterQuery) {
    try {
      const totalBranches = await Branch.countDocuments();
      const totalCustomers = await Customer.countDocuments();
      const totalProducts = await Product.countDocuments();
      const activeUsers = await Employee.countDocuments({
        isActive: true,
        role: { $in: ['CASHIER', 'MANAGER', 'EMPLOYEE', 'cashier', 'manager', 'employee'] }
      });

      return {
        totalBranches,
        totalCustomers,
        totalProducts,
        activeUsers,
      };
    } catch (error) {
      console.error('Error calculating system metrics:', error);
      return {};
    }
  }

  /**
   * Calculate Key Performance Indicators (KPIs)
   */
  calculateKPIs(metrics) {
    const { salesStats = {}, inventoryStats = {}, employeeStats = {} } = metrics;

    const kpis = {
      // Sales KPIs
      revenue: salesStats.totalRevenue || 0,
      profit: (salesStats.netRevenue || 0) * 0.3, // Assuming 30% profit margin
      profitMargin: salesStats.totalRevenue > 0 ? ((salesStats.netRevenue / salesStats.totalRevenue) * 100).toFixed(2) : 0,
      salesGrowth: salesStats.growthTrend || 0,
      transactionCount: salesStats.totalTransactions || 0,

      // Inventory KPIs
      inventoryValue: inventoryStats.totalValue || 0,
      stockTurnover: inventoryStats.inventoryTurnover || 0,
      lowStockAlertCount: inventoryStats.lowStockAlert?.count || 0,
      inventoryAccuracy: inventoryStats.stockHealth?.accuracy || 0,

      // Employee KPIs
      employeeProductivity: employeeStats.performanceMetrics?.averageProductivity || 0,
      employeeAttendanceRate: employeeStats.attendanceData?.attendanceRate || 0,
      employeeRetention: ((employeeStats.activeEmployees / (employeeStats.totalEmployees || 1)) * 100).toFixed(2),
      averagePerformanceRating: employeeStats.performanceMetrics?.averageRating || 0,

      // Customer KPIs
      customerCount: 0,
      customerRetention: 0,
    };

    return kpis;
  }

  /**
   * Calculate inventory turnover rate
   */
  async calculateInventoryTurnover(filterQuery) {
    try {
      const totalCostOfGoodsSold = await Sale.aggregate([
        { $match: filterQuery },
        {
          $group: {
            _id: null,
            totalCost: { $sum: { $multiply: [{ $arrayElemAt: ['$items.quantity', 0] }, '$costPerUnit'] } },
          },
        },
      ]);

      const averageInventoryValue = await Inventory.aggregate([
        {
          $group: {
            _id: null,
            avgValue: { $avg: '$quantity' },
          },
        },
      ]);

      const turnoverRate =
        averageInventoryValue[0]?.avgValue > 0
          ? (totalCostOfGoodsSold[0]?.totalCost || 0) / averageInventoryValue[0].avgValue
          : 0;

      return parseFloat(turnoverRate.toFixed(2));
    } catch (error) {
      console.error('Error calculating inventory turnover:', error);
      return 0;
    }
  }

  /**
   * Calculate stock health metrics
   */
  calculateStockHealth(inventoryData, lowStockItems) {
    const totalItems = inventoryData[0]?.totalItems || 1;
    const lowStockCount = lowStockItems.length;

    return {
      healthy: ((totalItems - lowStockCount) / totalItems * 100).toFixed(2),
      warning: (lowStockCount / totalItems * 100).toFixed(2),
      accuracy: 95.5, // Default value, can be calculated from audit logs
    };
  }

  /**
   * Calculate growth trend from daily sales data
   */
  calculateGrowthTrend(dailySalesData) {
    if (dailySalesData.length < 2) return 0;

    const firstWeek = dailySalesData.slice(0, Math.floor(dailySalesData.length / 2));
    const secondWeek = dailySalesData.slice(Math.floor(dailySalesData.length / 2));

    const firstWeekTotal = firstWeek.reduce((sum, day) => sum + (day.revenue || 0), 0);
    const secondWeekTotal = secondWeek.reduce((sum, day) => sum + (day.revenue || 0), 0);

    if (firstWeekTotal === 0) return 0;

    const growth = ((secondWeekTotal - firstWeekTotal) / firstWeekTotal * 100).toFixed(2);
    return parseFloat(growth);
  }

  /**
   * Generate summary text for dashboard
   */
  generateSummary(salesStats, inventoryStats, employeeStats, kpis) {
    const summaries = [];

    if (kpis.revenue > 0) {
      summaries.push(`Revenue: $${(kpis.revenue / 1000).toFixed(2)}K`);
    }

    if (kpis.salesGrowth > 0) {
      summaries.push(`Sales growth: +${kpis.salesGrowth}%`);
    }

    if (kpis.lowStockAlertCount > 0) {
      summaries.push(`${kpis.lowStockAlertCount} items low in stock`);
    }

    if (kpis.employeeAttendanceRate > 0) {
      summaries.push(`Attendance rate: ${kpis.employeeAttendanceRate}%`);
    }

    return summaries.join(' | ');
  }

  /**
   * Get branch-specific dashboard data
   */
  async getBranchDashboard(branchId, options = {}) {
    try {
      const filterQuery = {
        ...options.dateFilter,
        branchId,
      };

      const branchData = await Branch.findById(branchId);
      const stats = await this.getDashboardStats({ ...options, branchId });

      return {
        branch: branchData,
        statistics: stats,
      };
    } catch (error) {
      throw new Error(`Error fetching branch dashboard: ${error.message}`);
    }
  }

  /**
   * Get multi-branch comparison data
   */
  async getMultiBranchComparison(options = {}) {
    try {
      const branches = await Branch.find();
      const comparisons = await Promise.all(
        branches.map((branch) =>
          this.getBranchDashboard(branch._id, options)
        )
      );

      return {
        branches: comparisons,
        comparison: this.generateComparison(comparisons),
      };
    } catch (error) {
      throw new Error(`Error fetching branch comparison: ${error.message}`);
    }
  }

  /**
   * Generate branch comparison metrics
   */
  generateComparison(branchData) {
    // Sort branches by performance metrics
    const sortedByRevenue = [...branchData].sort(
      (a, b) => (b.statistics.kpis.revenue || 0) - (a.statistics.kpis.revenue || 0)
    );

    const sortedByGrowth = [...branchData].sort(
      (a, b) => (b.statistics.kpis.salesGrowth || 0) - (a.statistics.kpis.salesGrowth || 0)
    );

    return {
      topByRevenue: sortedByRevenue[0],
      topByGrowth: sortedByGrowth[0],
      averageRevenue: (
        branchData.reduce((sum, b) => sum + (b.statistics.kpis.revenue || 0), 0) / branchData.length
      ).toFixed(2),
      totalSystemRevenue: branchData
        .reduce((sum, b) => sum + (b.statistics.kpis.revenue || 0), 0)
        .toFixed(2),
    };
  }
}

module.exports = new DashboardService();
