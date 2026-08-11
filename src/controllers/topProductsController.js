const mongoose = require('mongoose');
const Sale = require('../models/Sale');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_REPORT_LIMIT = 5000;

const toObjectId = (value) => {
  if (!value) return null;

  const rawValue = typeof value === 'object' && value._id ? value._id : value;
  const id = String(rawValue);

  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
};

const getDateRange = (query) => {
  const now = new Date();

  const endDate = query.endDate ? new Date(query.endDate) : now;
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - 30 * MS_PER_DAY);

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
};

const buildMatch = (req, startDate, endDate) => {
  const match = {
    createdAt: { $gte: startDate, $lte: endDate },
    $or: [
      { status: 'COMPLETED' },
      { status: { $exists: false } },
      { status: null },
    ],
  };

  const branchFromQuery = toObjectId(req.query.branchId || req.query.branch);
  const branchFromUser = toObjectId(req.user?.branch);
  const allBranches =
    String(req.query.allBranches || '').toLowerCase() === 'true';

  if (branchFromQuery) {
    match.branch = branchFromQuery;
  } else if (branchFromUser && !allBranches) {
    match.branch = branchFromUser;
  }

  return match;
};

const getPreviousDateRange = (startDate, endDate) => {
  const duration = endDate.getTime() - startDate.getTime();
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate.getTime() - duration);

  return { previousStartDate, previousEndDate };
};

const round2 = (value) => Number((Number(value) || 0).toFixed(2));

const productKey = (product) => {
  if (product.productId) return String(product.productId);
  if (product.barcode) return `barcode|${product.barcode}`;
  return `name|${product.name || 'Unknown Product'}`;
};

const aggregateTopProducts = async (match) => {
  return Sale.aggregate([
    { $match: match },

    { $unwind: '$items' },

    {
      $lookup: {
        from: 'products',
        let: {
          itemProductId: '$items.product',
          itemBarcode: { $ifNull: ['$items.barcode', ''] },
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $and: [
                      { $ne: ['$$itemProductId', null] },
                      { $eq: ['$_id', '$$itemProductId'] },
                    ],
                  },
                  {
                    $and: [
                      { $ne: ['$$itemBarcode', ''] },
                      { $eq: ['$barcode', '$$itemBarcode'] },
                    ],
                  },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'productInfo',
      },
    },

    {
      $addFields: {
        productDoc: { $arrayElemAt: ['$productInfo', 0] },

        itemQuantity: {
          $convert: {
            input: '$items.quantity',
            to: 'double',
            onError: 0,
            onNull: 0,
          },
        },

        itemUnitPrice: {
          $convert: {
            input: {
              $ifNull: ['$items.unitPrice', { $ifNull: ['$items.price', 0] }],
            },
            to: 'double',
            onError: 0,
            onNull: 0,
          },
        },

        itemDiscount: {
          $convert: {
            input: '$items.discount',
            to: 'double',
            onError: 0,
            onNull: 0,
          },
        },

        rawLineTotal: {
          $convert: {
            input: '$items.lineTotal',
            to: 'double',
            onError: null,
            onNull: null,
          },
        },
      },
    },

    {
      $addFields: {
        computedLineTotal: {
          $multiply: [
            '$itemQuantity',
            '$itemUnitPrice',
            {
              $subtract: [
                1,
                {
                  $divide: ['$itemDiscount', 100],
                },
              ],
            },
          ],
        },

        resolvedProductId: {
          $ifNull: ['$productDoc._id', '$items.product'],
        },

        resolvedName: {
          $ifNull: [
            '$productDoc.name',
            {
              $ifNull: ['$items.name', 'Unknown Product'],
            },
          ],
        },

        resolvedBarcode: {
          $ifNull: [
            '$productDoc.barcode',
            {
              $ifNull: ['$items.barcode', ''],
            },
          ],
        },

        resolvedBrand: {
          $ifNull: [
            '$productDoc.brand',
            {
              $ifNull: ['$items.brand', ''],
            },
          ],
        },

        resolvedCategoryName: {
          $ifNull: [
            '$productDoc.categoryName',
            {
              $ifNull: ['$items.categoryName', ''],
            },
          ],
        },
      },
    },

    {
      $addFields: {
        productGroupKey: {
          $cond: [
            { $ne: ['$resolvedProductId', null] },
            { $toString: '$resolvedProductId' },
            {
              $cond: [
                { $ne: ['$resolvedBarcode', ''] },
                { $concat: ['barcode|', '$resolvedBarcode'] },
                { $concat: ['name|', '$resolvedName'] },
              ],
            },
          ],
        },

        lineRevenue: {
          $ifNull: ['$rawLineTotal', '$computedLineTotal'],
        },
      },
    },

    {
      $group: {
        _id: '$productGroupKey',

        productId: { $first: '$resolvedProductId' },
        name: { $first: '$resolvedName' },
        barcode: { $first: '$resolvedBarcode' },
        brand: { $first: '$resolvedBrand' },
        categoryName: { $first: '$resolvedCategoryName' },

        unitsSold: { $sum: '$itemQuantity' },
        revenue: { $sum: '$lineRevenue' },
        ordersSet: { $addToSet: '$_id' },
        lastSoldAt: { $max: '$createdAt' },
      },
    },

    {
      $addFields: {
        orders: { $size: '$ordersSet' },
        averagePrice: {
          $cond: [
            { $gt: ['$unitsSold', 0] },
            { $divide: ['$revenue', '$unitsSold'] },
            0,
          ],
        },
      },
    },

    {
      $project: {
        _id: 0,
        ordersSet: 0,
      },
    },

    {
      $sort: {
        unitsSold: -1,
        revenue: -1,
        name: 1,
      },
    },
  ]);
};

const attachRankAndGrowth = (currentProducts, previousProducts) => {
  const previousMap = new Map(
    previousProducts.map((product) => [productKey(product), product])
  );

  return currentProducts.map((product, index) => {
    const previous = previousMap.get(productKey(product));
    const previousRevenue = previous?.revenue || 0;

    const growth =
      previousRevenue > 0
        ? ((product.revenue - previousRevenue) / previousRevenue) * 100
        : 0;

    return {
      rank: index + 1,
      productId: product.productId,
      name: product.name,
      barcode: product.barcode,
      brand: product.brand,
      categoryName: product.categoryName,
      unitsSold: round2(product.unitsSold),
      revenue: round2(product.revenue),
      orders: product.orders,
      averagePrice: round2(product.averagePrice),
      growth: round2(growth),
      lastSoldAt: product.lastSoldAt,
    };
  });
};

const buildSummary = async (match, products) => {
  const totalOrders = await Sale.countDocuments(match);

  return {
    totalProducts: products.length,
    totalUnitsSold: round2(
      products.reduce((sum, item) => sum + (item.unitsSold || 0), 0)
    ),
    totalRevenue: round2(
      products.reduce((sum, item) => sum + (item.revenue || 0), 0)
    ),
    totalOrders,
  };
};

const getTopProducts = async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req.query);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 5, 1),
      MAX_REPORT_LIMIT
    );

    const match = buildMatch(req, startDate, endDate);

    const { previousStartDate, previousEndDate } = getPreviousDateRange(
      startDate,
      endDate
    );

    const previousMatch = buildMatch(req, previousStartDate, previousEndDate);

    const [currentProducts, previousProducts] = await Promise.all([
      aggregateTopProducts(match),
      aggregateTopProducts(previousMatch),
    ]);

    const productsWithGrowth = attachRankAndGrowth(
      currentProducts,
      previousProducts
    );

    const summary = await buildSummary(match, currentProducts);

    return res.status(200).json({
      success: true,
      message: 'Top performing products retrieved successfully',
      data: {
        period: { startDate, endDate },
        summary,
        products: productsWithGrowth.slice(0, limit),
      },
    });
  } catch (error) {
    console.error('getTopProducts error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to get top performing products',
      error: error.message,
    });
  }
};

const getTopProductsReport = async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req.query);

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      MAX_REPORT_LIMIT
    );

    const match = buildMatch(req, startDate, endDate);

    const { previousStartDate, previousEndDate } = getPreviousDateRange(
      startDate,
      endDate
    );

    const previousMatch = buildMatch(req, previousStartDate, previousEndDate);

    const [currentProducts, previousProducts] = await Promise.all([
      aggregateTopProducts(match),
      aggregateTopProducts(previousMatch),
    ]);

    const productsWithGrowth = attachRankAndGrowth(
      currentProducts,
      previousProducts
    );

    const total = productsWithGrowth.length;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, pages);
    const startIndex = (safePage - 1) * limit;

    const paginatedProducts = productsWithGrowth.slice(
      startIndex,
      startIndex + limit
    );

    const summary = await buildSummary(match, currentProducts);

    return res.status(200).json({
      success: true,
      message: 'Top products full report retrieved successfully',
      data: {
        period: { startDate, endDate },
        summary,
        products: paginatedProducts,
        pagination: {
          total,
          page: safePage,
          limit,
          pages,
          hasNextPage: safePage < pages,
          hasPrevPage: safePage > 1,
        },
      },
    });
  } catch (error) {
    console.error('getTopProductsReport error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to get top products full report',
      error: error.message,
    });
  }
};

module.exports = {
  getTopProducts,
  getTopProductsReport,
};