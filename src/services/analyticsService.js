const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const Category = require('../models/Category');
const Customer = require('../models/Customer');
const Inventory = require('../models/Inventory');
const Return = require('../models/Return');

class AnalyticsService {

  buildDateMatch(fromDate, toDate) {
    const match = {};
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }
    return match;
  }

  buildBranchMatch(branchId) {
    if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) return {};
    return { branch: new mongoose.Types.ObjectId(branchId) };
  }

  /**
   * Sales & Profit Trends
   * GET /api/analytics/sales-trends
   */
  async getSalesTrends({ fromDate, toDate, branchId, granularity = 'day' }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    let dateFormat;
    let groupId;
    if (granularity === 'hour') {
      dateFormat = '%Y-%m-%dT%H:00:00';
      groupId = { $dateToString: { format: dateFormat, date: '$createdAt' } };
    } else if (granularity === 'week') {
      groupId = { $dateToString: { format: '%G-W%V', date: '$createdAt' } };
    } else if (granularity === 'month') {
      dateFormat = '%Y-%m';
      groupId = { $dateToString: { format: dateFormat, date: '$createdAt' } };
    } else if (granularity === 'year') {
      dateFormat = '%Y';
      groupId = { $dateToString: { format: dateFormat, date: '$createdAt' } };
    } else {
      dateFormat = '%Y-%m-%d';
      groupId = { $dateToString: { format: dateFormat, date: '$createdAt' } };
    }

    const trends = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
          totalTax: { $sum: { $ifNull: ['$taxAmount', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalRevenue = trends.reduce((s, t) => s + t.revenue, 0);
    const prevPeriod = trends.slice(0, Math.floor(trends.length / 2));
    const currPeriod = trends.slice(Math.floor(trends.length / 2));
    const prevTotal = prevPeriod.reduce((s, t) => s + t.revenue, 0);
    const currTotal = currPeriod.reduce((s, t) => s + t.revenue, 0);
    const growthRate = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;

    return {
      granularity,
      trends,
      summary: {
        totalRevenue,
        totalTransactions: trends.reduce((s, t) => s + t.transactionCount, 0),
        avgOrderValue: trends.length > 0 ? totalRevenue / trends.reduce((s, t) => s + t.transactionCount, 0) : 0,
        growthRate: parseFloat(growthRate.toFixed(2)),
        periodCount: trends.length,
      },
    };
  }

  /**
   * Profit Trends
   * GET /api/analytics/profit-trends
   */
  async getProfitTrends({ fromDate, toDate, branchId, granularity = 'day' }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    let groupId;
    if (granularity === 'month') {
      groupId = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
    } else if (granularity === 'week') {
      groupId = { $dateToString: { format: '%G-W%V', date: '$createdAt' } };
    } else if (granularity === 'year') {
      groupId = { $dateToString: { format: '%Y', date: '$createdAt' } };
    } else {
      groupId = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    const profitData = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            period: groupId,
            saleId: '$_id',
          },
          date: { $first: '$createdAt' },
          revenue: { $sum: '$items.lineTotal' },
          cost: {
            $sum: {
              $multiply: [
                '$items.quantity',
                { $ifNull: ['$productInfo.costPrice', { $multiply: ['$items.unitPrice', 0.7] }] },
              ],
            },
          },
          discount: { $first: { $ifNull: ['$discountAmount', 0] } },
        },
      },
      {
        $group: {
          _id: '$_id.period',
          revenue: { $sum: '$revenue' },
          cost: { $sum: '$cost' },
          discount: { $sum: '$discount' },
          transactionCount: { $sum: 1 },
          avgMargin: { $avg: { $cond: [{ $gt: ['$revenue', 0] }, { $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] }, 100] }, 0] } },
        },
      },
      {
        $addFields: {
          grossProfit: { $subtract: ['$revenue', '$cost'] },
          netProfit: { $subtract: [{ $subtract: ['$revenue', '$cost'] }, '$discount'] },
          profitMargin: {
            $cond: [{ $gt: ['$revenue', 0] }, { $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] }, 100] }, 0],
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalRevenue = profitData.reduce((s, p) => s + p.revenue, 0);
    const totalCost = profitData.reduce((s, p) => s + p.cost, 0);
    const totalProfit = profitData.reduce((s, p) => s + p.netProfit, 0);

    return {
      granularity,
      profitData,
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalTransactions: profitData.reduce((s, p) => s + p.transactionCount, 0),
        overallMargin: totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0,
      },
    };
  }

  /**
   * Revenue Breakdown by Category / Payment Method / Time
   * GET /api/analytics/revenue-breakdown
   */
  async getRevenueBreakdown({ fromDate, toDate, branchId, groupBy = 'category' }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    const matchStage = { $match: match };

    if (groupBy === 'paymentMethod') {
      const data = await Sale.aggregate([
        matchStage,
        {
          $group: {
            _id: '$paymentMethod',
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 },
            avgValue: { $avg: '$totalAmount' },
          },
        },
        { $sort: { revenue: -1 } },
      ]);
      return { groupBy, data };
    }

    if (groupBy === 'hour') {
      const data = await Sale.aggregate([
        matchStage,
        {
          $group: {
            _id: { $hour: '$createdAt' },
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      return { groupBy, data };
    }

    if (groupBy === 'dayOfWeek') {
      const data = await Sale.aggregate([
        matchStage,
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      return { groupBy, data };
    }

    // Default: group by category
    const data = await Sale.aggregate([
      matchStage,
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'productInfo.category',
          foreignField: '_id',
          as: 'categoryInfo',
        },
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
          revenue: { $sum: '$items.lineTotal' },
          count: { $sum: '$items.quantity' },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    return { groupBy, data };
  }

  /**
   * Branch Performance Comparison
   * GET /api/analytics/branch-performance
   */
  async getBranchPerformance({ fromDate, toDate, branchId }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    const branchStats = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$branch',
          revenue: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
          totalItems: { $sum: { $sum: '$items.quantity' } },
        },
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branchInfo',
        },
      },
      { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          branchName: { $ifNull: ['$branchInfo.name', 'Unknown'] },
          city: { $ifNull: ['$branchInfo.city', ''] },
          isActive: { $ifNull: ['$branchInfo.isActive', false] },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const totalRevenue = branchStats.reduce((s, b) => s + b.revenue, 0);
    const totalTransactions = branchStats.reduce((s, b) => s + b.transactionCount, 0);

    const enriched = branchStats.map((b, i) => ({
      ...b,
      rank: i + 1,
      revenueShare: totalRevenue > 0 ? parseFloat(((b.revenue / totalRevenue) * 100).toFixed(2)) : 0,
      transactionShare: totalTransactions > 0 ? parseFloat(((b.transactionCount / totalTransactions) * 100).toFixed(2)) : 0,
    }));

    const comparisons = [];
    for (let i = 0; i < enriched.length - 1; i++) {
      for (let j = i + 1; j < enriched.length; j++) {
        comparisons.push({
          higher: enriched[i].branchName,
          lower: enriched[j].branchName,
          revenueDiff: enriched[i].revenue - enriched[j].revenue,
          revenueDiffPercent: enriched[j].revenue > 0
            ? parseFloat((((enriched[i].revenue - enriched[j].revenue) / enriched[j].revenue) * 100).toFixed(2))
            : 0,
          transactionDiff: enriched[i].transactionCount - enriched[j].transactionCount,
          avgValueDiff: parseFloat((enriched[i].avgOrderValue - enriched[j].avgOrderValue).toFixed(2)),
        });
      }
    }

    return {
      branches: enriched,
      comparisons,
      totals: {
        totalRevenue,
        totalTransactions,
        averageRevenue: enriched.length > 0 ? totalRevenue / enriched.length : 0,
        topBranch: enriched[0] || null,
      },
    };
  }

  /**
   * Branch Rankings
   * GET /api/analytics/branch-rankings
   */
  async getBranchRankings({ fromDate, toDate, branchId, metric = 'revenue' }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    // 'growth' is not computed in the aggregation — fall back to revenue sort
    const sortField = metric === 'transactions' ? 'transactionCount'
      : metric === 'avgOrderValue' ? 'avgOrderValue'
      : 'revenue';

    const branchAgg = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$branch',
          revenue: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
        },
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branchInfo',
        },
      },
      { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          branchName: { $ifNull: ['$branchInfo.name', 'Unknown'] },
          city: { $ifNull: ['$branchInfo.city', ''] },
        },
      },
      { $sort: { [sortField]: -1 } },
    ]);

    const total = branchAgg.reduce((s, b) => s + b.revenue, 0);

    const rankings = branchAgg.map((b, i) => ({
      rank: i + 1,
      branchId: b._id,
      branchName: b.branchName,
      city: b.city,
      revenue: b.revenue,
      transactionCount: b.transactionCount,
      avgOrderValue: parseFloat(b.avgOrderValue.toFixed(2)),
      share: total > 0 ? parseFloat(((b.revenue / total) * 100).toFixed(2)) : 0,
    }));

    return {
      metric,
      rankings,
      totalRevenue: total,
      rankedBy: sortField,
    };
  }

  /**
   * Drill-Down Analysis – hierarchical exploration
   * GET /api/analytics/drill-down?groupBy=year|month|day&fromDate=&toDate=&branchId=
   */
  async getDrillDown({ fromDate, toDate, branchId, groupBy = 'day', page = 1, limit = 50 }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    let groupId;
    if (groupBy === 'year') {
      groupId = { $dateToString: { format: '%Y', date: '$createdAt' } };
    } else if (groupBy === 'month') {
      groupId = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
    } else if (groupBy === 'branch') {
      groupId = '$branch';
    } else if (groupBy === 'product') {
      groupId = '$items.product';
    } else if (groupBy === 'category') {
      groupId = null; // handled differently
    } else {
      groupId = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    if (groupBy === 'category') {
      const result = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'productInfo.category',
            foreignField: '_id',
            as: 'categoryInfo',
          },
        },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
            revenue: { $sum: '$items.lineTotal' },
            transactionCount: { $sum: 1 },
            itemCount: { $sum: '$items.quantity' },
            avgPrice: { $avg: '$items.unitPrice' },
          },
        },
        { $sort: { revenue: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      const countResult = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'productInfo.category',
            foreignField: '_id',
            as: 'categoryInfo',
          },
        },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
          },
        },
        { $count: 'total' },
      ]);

      return {
        groupBy,
        data: result,
        pagination: {
          page,
          limit,
          total: countResult[0]?.total || 0,
        },
      };
    }

    if (groupBy === 'product') {
      const result = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.name' },
            revenue: { $sum: '$items.lineTotal' },
            quantitySold: { $sum: '$items.quantity' },
            transactionCount: { $sum: 1 },
            avgPrice: { $avg: '$items.unitPrice' },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            barcode: { $ifNull: ['$productInfo.barcode', ''] },
          },
        },
        { $sort: { revenue: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      const countResult = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: { _id: '$items.product' } },
        { $count: 'total' },
      ]);

      return {
        groupBy,
        data: result,
        pagination: {
          page,
          limit,
          total: countResult[0]?.total || 0,
        },
      };
    }

    if (groupBy === 'branch') {
      const result = await Sale.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$branch',
            revenue: { $sum: '$totalAmount' },
            transactionCount: { $sum: 1 },
            avgOrderValue: { $avg: '$totalAmount' },
          },
        },
        {
          $lookup: {
            from: 'branches',
            localField: '_id',
            foreignField: '_id',
            as: 'branchInfo',
          },
        },
        { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            name: { $ifNull: ['$branchInfo.name', 'Unknown'] },
            city: { $ifNull: ['$branchInfo.city', ''] },
          },
        },
        { $sort: { revenue: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      const countResult = await Sale.aggregate([
        { $match: match },
        { $group: { _id: '$branch' } },
        { $count: 'total' },
      ]);

      return {
        groupBy,
        data: result,
        pagination: {
          page,
          limit,
          total: countResult[0]?.total || 0,
        },
      };
    }

    // Default: time-based drill-down
    const result = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
          totalItems: { $sum: { $sum: '$items.quantity' } },
        },
      },
      { $sort: { _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    const countResult = await Sale.aggregate([
      { $match: match },
      { $group: { _id: groupId } },
      { $count: 'total' },
    ]);

    return {
      groupBy,
      data: result,
      pagination: {
        page,
        limit,
        total: countResult[0]?.total || 0,
      },
    };
  }

  /**
   * Drill into a specific group's transactions
   * GET /api/analytics/drill-down/:groupId/transactions
   */
  async getDrillDownTransactions({ groupBy, groupValue, fromDate, toDate, branchId, page = 1, limit = 20 }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    if (groupBy === 'date' && groupValue) {
      const startOfDay = new Date(groupValue);
      const endOfDay = new Date(groupValue);
      endOfDay.setHours(23, 59, 59, 999);
      match.createdAt = { ...(match.createdAt || {}), $gte: startOfDay, $lte: endOfDay };
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Sale.find(match)
        .populate('branch', 'name city')
        .populate('cashier', 'firstName lastName')
        .populate('customer', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(match),
    ]);

    return {
      groupBy,
      groupValue,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Product Performance Analytics
   * GET /api/analytics/product-performance
   */
  async getProductPerformance({ fromDate, toDate, branchId, sortBy = 'revenue', page = 1, limit = 20 }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    const sortField = sortBy === 'quantity' ? 'quantitySold'
      : sortBy === 'margin' ? 'profitMargin'
      : 'revenue';

    const products = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          revenue: { $sum: '$items.lineTotal' },
          quantitySold: { $sum: '$items.quantity' },
          transactionCount: { $sum: 1 },
          avgUnitPrice: { $avg: '$items.unitPrice' },
          totalDiscount: { $sum: { $ifNull: ['$items.discount', 0] } },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'productInfo.category',
          foreignField: '_id',
          as: 'categoryInfo',
        },
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          costPrice: { $ifNull: ['$productInfo.costPrice', 0] },
          category: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
          barcode: { $ifNull: ['$productInfo.barcode', ''] },
          profit: {
            $subtract: [
              '$revenue',
              { $multiply: ['$quantitySold', { $ifNull: ['$productInfo.costPrice', { $multiply: ['$avgUnitPrice', 0.7] }] }] },
            ],
          },
        },
      },
      {
        $addFields: {
          profitMargin: {
            $cond: [{ $gt: ['$revenue', 0] }, { $multiply: [{ $divide: ['$profit', '$revenue'] }, 100] }, 0],
          },
        },
      },
      { $sort: { [sortField]: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    const countResult = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: '$items.product' } },
      { $count: 'total' },
    ]);

    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);

    return {
      products,
      summary: {
        totalRevenue,
        totalProducts: countResult[0]?.total || 0,
        averageRevenuePerProduct: products.length > 0 ? totalRevenue / products.length : 0,
      },
      pagination: {
        page,
        limit,
        total: countResult[0]?.total || 0,
      },
    };
  }

  /**
   * Category Analysis
   * GET /api/analytics/category-analysis
   */
  async getCategoryAnalysis({ fromDate, toDate, branchId }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    const categories = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'productInfo.category',
          foreignField: '_id',
          as: 'categoryInfo',
        },
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
          revenue: { $sum: '$items.lineTotal' },
          quantitySold: { $sum: '$items.quantity' },
          transactionCount: { $sum: 1 },
          avgPrice: { $avg: '$items.unitPrice' },
          productCount: { $addToSet: '$items.product' },
        },
      },
      {
        $addFields: {
          uniqueProducts: { $size: '$productCount' },
        },
      },
      { $project: { productCount: 0 } },
      { $sort: { revenue: -1 } },
    ]);

    const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);

    return {
      categories: categories.map((c, i) => ({
        ...c,
        share: totalRevenue > 0 ? parseFloat(((c.revenue / totalRevenue) * 100).toFixed(2)) : 0,
        rank: i + 1,
      })),
      summary: {
        totalRevenue,
        totalCategories: categories.length,
        topCategory: categories[0] || null,
      },
    };
  }

  /**
   * Customer Insights
   * GET /api/analytics/customer-insights
   */
  async getCustomerInsights({ fromDate, toDate, branchId }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    const customerMetrics = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$customer',
          transactionCount: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          avgOrderValue: { $avg: '$totalAmount' },
          firstPurchase: { $min: '$createdAt' },
          lastPurchase: { $max: '$createdAt' },
          preferredPayment: { $first: '$paymentMethod' },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customerInfo',
        },
      },
      { $unwind: { path: '$customerInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          customerName: {
            $cond: [
              { $ifNull: ['$customerInfo.firstName', false] },
              { $concat: ['$customerInfo.firstName', ' ', { $ifNull: ['$customerInfo.lastName', ''] }] },
              'Walk-in Customer',
            ],
          },
          customerType: { $ifNull: ['$customerInfo.customerType', 'WALK_IN'] },
          email: { $ifNull: ['$customerInfo.email', ''] },
          phone: { $ifNull: ['$customerInfo.phone', ''] },
        },
      },
      { $sort: { totalSpent: -1 } },
    ]);

    const totalCustomers = customerMetrics.length;
    const totalRevenue = customerMetrics.reduce((s, c) => s + c.totalSpent, 0);
    const avgRevenuePerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    const segments = {};
    customerMetrics.forEach((c) => {
      const type = c.customerType || 'WALK_IN';
      if (!segments[type]) segments[type] = { count: 0, revenue: 0, transactions: 0 };
      segments[type].count++;
      segments[type].revenue += c.totalSpent;
      segments[type].transactions += c.transactionCount;
    });

    const segmentData = Object.entries(segments).map(([type, data]) => ({
      type,
      count: data.count,
      revenue: data.revenue,
      transactions: data.transactions,
      avgValue: data.transactions > 0 ? data.revenue / data.transactions : 0,
      share: totalRevenue > 0 ? parseFloat(((data.revenue / totalRevenue) * 100).toFixed(2)) : 0,
    }));

    return {
      customerMetrics,
      segments: segmentData,
      summary: {
        totalCustomers,
        totalRevenue,
        avgRevenuePerCustomer: parseFloat(avgRevenuePerCustomer.toFixed(2)),
        avgOrdersPerCustomer: totalCustomers > 0
          ? parseFloat((customerMetrics.reduce((s, c) => s + c.transactionCount, 0) / totalCustomers).toFixed(2))
          : 0,
      },
    };
  }

  /**
   * KPI Summary
   * GET /api/analytics/kpi-summary
   */
  async getKPISummary({ fromDate, toDate, branchId }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    // Build a date-aware match for Returns so refundRate is accurate
    const returnMatch = { status: 'Refunded' };
    if (dateMatch.createdAt) returnMatch.createdAt = dateMatch.createdAt;

    const [salesKPI, productStats, branchStats, inventoryStats, customerCount, returnStats, costAgg] = await Promise.all([
      Sale.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalTransactions: { $sum: 1 },
            totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
            totalTax: { $sum: { $ifNull: ['$taxAmount', 0] } },
            avgOrderValue: { $avg: '$totalAmount' },
          },
        },
      ]),
      Product.countDocuments({ isActive: true }),
      Branch.countDocuments({ isActive: true }),
      Inventory.aggregate([
        { $group: { _id: null, totalStock: { $sum: '$quantity' }, lowStock: { $sum: { $cond: ['$lowStockAlert', 1, 0] } } } },
      ]),
      Customer.countDocuments({ status: 'ACTIVE' }),
      Return.aggregate([
        { $match: returnMatch },
        { $group: { _id: null, totalReturns: { $sum: 1 }, totalRefunded: { $sum: '$amount' } } },
      ]),
      // Actual cost from product cost prices (same approach as getProfitTrends)
      Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalCost: {
              $sum: {
                $multiply: [
                  '$items.quantity',
                  { $ifNull: ['$productInfo.costPrice', { $multiply: ['$items.unitPrice', 0.7] }] },
                ],
              },
            },
          },
        },
      ]),
    ]);

    const s = salesKPI[0] || {};
    const inv = inventoryStats[0] || {};
    const ret = returnStats[0] || {};
    const costData = costAgg[0] || {};

    const totalRevenue = s.totalRevenue || 0;
    // Use real cost from product records; fall back to 65% estimate only if no cost data
    const totalCost = costData.totalCost != null ? costData.totalCost : totalRevenue * 0.65;
    const netProfit = totalRevenue - totalCost - (s.totalDiscount || 0);

    return {
      revenue: totalRevenue,
      transactions: s.totalTransactions || 0,
      avgOrderValue: parseFloat((s.avgOrderValue || 0).toFixed(2)),
      totalDiscount: s.totalDiscount || 0,
      netProfit: parseFloat(netProfit.toFixed(2)),
      profitMargin: totalRevenue > 0 ? parseFloat(((netProfit / totalRevenue) * 100).toFixed(2)) : 0,
      activeProducts: productStats,
      activeBranches: branchStats,
      totalStock: inv.totalStock || 0,
      lowStockItems: inv.lowStock || 0,
      activeCustomers: customerCount,
      totalReturns: ret.totalReturns || 0,
      totalRefunded: ret.totalRefunded || 0,
      refundRate: s.totalTransactions > 0
        ? parseFloat((((ret.totalReturns || 0) / s.totalTransactions) * 100).toFixed(2))
        : 0,
    };
  }

  /**
   * KPI Trends
   * GET /api/analytics/kpi-trends
   */
  async getKPITrends({ fromDate, toDate, branchId }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    return Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          revenue: { $sum: '$totalAmount' },
          transactions: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
        },
      },
      {
        $addFields: {
          period: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $cond: [{ $lt: ['$_id.month', 10] }, { $concat: ['0', { $toString: '$_id.month' }] }, { $toString: '$_id.month' }] },
            ],
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
  }

  /**
   * Automated Analytical Insights
   * GET /api/analytics/insights
   */
  async getInsights({ fromDate, toDate, branchId }) {
    const insights = [];

    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    // Current period data
    const currentData = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 },
          avgValue: { $avg: '$totalAmount' },
        },
      },
    ]);

    const curr = currentData[0] || { revenue: 0, count: 0, avgValue: 0 };

    // Previous period (same duration before fromDate)
    // When no fromDate is given, default to last 30 days so the comparison
    // is always against a meaningful prior period instead of all-time history.
    let prevMatch = { ...branchMatch, status: 'COMPLETED' };
    if (fromDate) {
      const from = new Date(fromDate);
      const to = toDate ? new Date(toDate) : new Date();
      if (toDate) to.setHours(23, 59, 59, 999);
      const duration = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - duration);
      prevMatch.createdAt = { $gte: prevFrom, $lt: from };
    } else {
      // Default: compare last 30 days vs the 30 days before that
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(now.getDate() - 60);
      prevMatch.createdAt = { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo };
    }

    const prevData = await Sale.aggregate([
      { $match: prevMatch },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const prev = prevData[0] || { revenue: 0, count: 0 };

    // Revenue insight
    if (curr.revenue > 0) {
      const growth = prev.revenue > 0 ? ((curr.revenue - prev.revenue) / prev.revenue) * 100 : 0;
      insights.push({
        type: 'revenue',
        label: 'Revenue Trend',
        value: curr.revenue,
        previousValue: prev.revenue,
        change: parseFloat(growth.toFixed(2)),
        direction: growth >= 0 ? 'up' : 'down',
        severity: Math.abs(growth) > 20 ? 'high' : Math.abs(growth) > 10 ? 'medium' : 'low',
        message: growth >= 0
          ? `Revenue increased by ${growth.toFixed(1)}% compared to previous period`
          : `Revenue decreased by ${Math.abs(growth).toFixed(1)}% compared to previous period`,
      });
    }

    // Transaction volume insight
    if (curr.count > 0) {
      const txGrowth = prev.count > 0 ? ((curr.count - prev.count) / prev.count) * 100 : 0;
      insights.push({
        type: 'transactions',
        label: 'Transaction Volume',
        value: curr.count,
        previousValue: prev.count,
        change: parseFloat(txGrowth.toFixed(2)),
        direction: txGrowth >= 0 ? 'up' : 'down',
        severity: Math.abs(txGrowth) > 20 ? 'high' : Math.abs(txGrowth) > 10 ? 'medium' : 'low',
        message: txGrowth >= 0
          ? `Transaction volume grew by ${txGrowth.toFixed(1)}%`
          : `Transaction volume declined by ${Math.abs(txGrowth).toFixed(1)}%`,
      });
    }

    // Average order value
    if (curr.avgValue > 0) {
      const aovGrowth = prev.avgValue > 0 ? ((curr.avgValue - prev.avgValue) / prev.avgValue) * 100 : 0;
      insights.push({
        type: 'avgOrderValue',
        label: 'Average Order Value',
        value: parseFloat(curr.avgValue.toFixed(2)),
        change: parseFloat(aovGrowth.toFixed(2)),
        direction: aovGrowth >= 0 ? 'up' : 'down',
        severity: Math.abs(aovGrowth) > 15 ? 'medium' : 'low',
        message: aovGrowth >= 0
          ? `Average order value increased to ${curr.avgValue.toFixed(2)}`
          : `Average order value decreased to ${curr.avgValue.toFixed(2)}`,
      });
    }

    // Low stock alert
    const lowStockCount = await Inventory.countDocuments({ lowStockAlert: true });
    if (lowStockCount > 0) {
      insights.push({
        type: 'inventory',
        label: 'Low Stock Alert',
        value: lowStockCount,
        severity: lowStockCount > 20 ? 'high' : lowStockCount > 10 ? 'medium' : 'low',
        message: `${lowStockCount} product(s) are running low on stock and need reordering`,
      });
    }

    // Top product insight
    const topProduct = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', revenue: { $sum: '$items.lineTotal' }, qty: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
      { $limit: 1 },
    ]);

    if (topProduct[0]) {
      insights.push({
        type: 'topProduct',
        label: 'Top Performing Product',
        value: topProduct[0]._id,
        details: {
          revenue: topProduct[0].revenue,
          quantitySold: topProduct[0].qty,
        },
        severity: 'low',
        message: `"${topProduct[0]._id}" is the top-selling product with ${topProduct[0].qty} units sold`,
      });
    }

    // Payment method preference
    const paymentPrefs = await Sale.aggregate([
      { $match: match },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    if (paymentPrefs[0]) {
      insights.push({
        type: 'paymentPreference',
        label: 'Preferred Payment Method',
        value: paymentPrefs[0]._id,
        details: paymentPrefs,
        severity: 'low',
        message: `"${paymentPrefs[0]._id}" is the most used payment method`,
      });
    }

    const returns = await Return.aggregate([
      { $match: { status: 'Refunded' } },
      { $group: { _id: null, total: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]);

    if (returns[0] && curr.count > 0) {
      const returnRate = (returns[0].total / curr.count) * 100;
      const severity = returnRate > 10 ? 'high' : returnRate > 5 ? 'medium' : 'low';
      insights.push({
        type: 'returns',
        label: 'Return Rate',
        value: returns[0].total,
        rate: parseFloat(returnRate.toFixed(2)),
        refundAmount: returns[0].amount,
        severity,
        message: `Return rate is ${returnRate.toFixed(1)}% (${returns[0].total} returns)`,
      });
    }

    return insights;
  }

  /**
   * Chart Data – formatted for frontend visualizations
   * GET /api/analytics/chart-data
   */
  async getChartData({ fromDate, toDate, branchId, chartType = 'revenue' }) {
    const dateMatch = this.buildDateMatch(fromDate, toDate);
    const branchMatch = this.buildBranchMatch(branchId);
    const match = { ...dateMatch, ...branchMatch, status: 'COMPLETED' };

    if (chartType === 'revenue') {
      const data = await Sale.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            value: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        chartType: 'line',
        labels: data.map((d) => d._id),
        datasets: [
          { label: 'Revenue', data: data.map((d) => d.value), borderColor: '#4CAF50', fill: false },
        ],
      };
    }

    if (chartType === 'profit') {
      const data = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$items.lineTotal' },
            cost: {
              $sum: {
                $multiply: [
                  '$items.quantity',
                  { $ifNull: ['$productInfo.costPrice', { $multiply: ['$items.unitPrice', 0.7] }] },
                ],
              },
            },
          },
        },
        {
          $addFields: {
            profit: { $subtract: ['$revenue', '$cost'] },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        chartType: 'line',
        labels: data.map((d) => d._id),
        datasets: [
          { label: 'Revenue', data: data.map((d) => d.revenue), borderColor: '#4CAF50', fill: false },
          { label: 'Cost', data: data.map((d) => d.cost), borderColor: '#f44336', fill: false },
          { label: 'Profit', data: data.map((d) => d.profit), borderColor: '#2196F3', fill: false },
        ],
      };
    }

    if (chartType === 'branchComparison' || chartType === 'branches') {
      const data = await Sale.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$branch',
            value: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'branches',
            localField: '_id',
            foreignField: '_id',
            as: 'branchInfo',
          },
        },
        { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            label: { $ifNull: ['$branchInfo.name', 'Unknown'] },
          },
        },
        { $sort: { value: -1 } },
      ]);

      return {
        chartType: 'bar',
        labels: data.map((d) => d.label),
        datasets: [
          { label: 'Revenue', data: data.map((d) => d.value), backgroundColor: '#42A5F5' },
          { label: 'Transactions', data: data.map((d) => d.count), backgroundColor: '#66BB6A' },
        ],
      };
    }

    if (chartType === 'paymentMethods' || chartType === 'payments') {
      const data = await Sale.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$paymentMethod',
            value: { $sum: '$totalAmount' },
          },
        },
      ]);

      return {
        chartType: 'pie',
        labels: data.map((d) => d._id),
        datasets: [
          {
            label: 'Revenue by Payment Method',
            data: data.map((d) => d.value),
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
          },
        ],
      };
    }

    if (chartType === 'category') {
      const data = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'productInfo.category',
            foreignField: '_id',
            as: 'categoryInfo',
          },
        },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
            value: { $sum: '$items.lineTotal' },
          },
        },
        { $sort: { value: -1 } },
      ]);

      return {
        chartType: 'doughnut',
        labels: data.map((d) => d._id),
        datasets: [
          {
            label: 'Revenue by Category',
            data: data.map((d) => d.value),
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
          },
        ],
      };
    }

    if (chartType === 'daily') {
      const data = await Sale.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            value: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        chartType: 'bar',
        labels: data.map((d) => dayNames[d._id - 1] || `Day ${d._id}`),
        datasets: [
          { label: 'Revenue', data: data.map((d) => d.value), backgroundColor: '#42A5F5' },
          { label: 'Transactions', data: data.map((d) => d.count), backgroundColor: '#66BB6A' },
        ],
      };
    }

    if (chartType === 'topProducts') {
      const data = await Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.name',
            value: { $sum: '$items.lineTotal' },
            quantity: { $sum: '$items.quantity' },
          },
        },
        { $sort: { value: -1 } },
        { $limit: 10 },
      ]);

      return {
        chartType: 'horizontalBar',
        labels: data.map((d) => d._id),
        datasets: [
          { label: 'Revenue', data: data.map((d) => d.value), backgroundColor: '#42A5F5' },
          { label: 'Quantity', data: data.map((d) => d.quantity), backgroundColor: '#66BB6A' },
        ],
      };
    }

    // Default: revenue by month
    const data = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          value: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      chartType: 'line',
      labels: data.map((d) => d._id),
      datasets: [
        { label: 'Revenue', data: data.map((d) => d.value), borderColor: '#4CAF50', fill: false },
      ],
    };
  }

  /**
   * Export Analytics Data as JSON
   * GET /api/analytics/export
   */
  async exportAnalytics({ fromDate, toDate, branchId, sections }) {
    const result = {};

    if (!sections || sections.includes('summary')) {
      result.summary = await this.getKPISummary({ fromDate, toDate, branchId });
    }

    if (!sections || sections.includes('salesTrends')) {
      result.salesTrends = await this.getSalesTrends({ fromDate, toDate, branchId });
    }

    if (!sections || sections.includes('profitTrends')) {
      result.profitTrends = await this.getProfitTrends({ fromDate, toDate, branchId });
    }

    if (!sections || sections.includes('branchPerformance')) {
      result.branchPerformance = await this.getBranchPerformance({ fromDate, toDate });
    }

    if (!sections || sections.includes('insights')) {
      result.insights = await this.getInsights({ fromDate, toDate, branchId });
    }

    return result;
  }
}

module.exports = new AnalyticsService();
