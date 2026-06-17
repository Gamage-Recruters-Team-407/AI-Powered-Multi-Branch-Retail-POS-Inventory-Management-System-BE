const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const StockMovement = require('../models/StockMovement');
const Product = require('../models/Product');
const ReorderRecommendation = require('../models/ReorderRecommendation');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeQuantity = (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : 0);

const getSalesConsumption = async (productId, branchId, days = 30) => {
    const since = new Date(Date.now() - Math.max(days, 1) * DAY_MS);
    const match = {
        product: new mongoose.Types.ObjectId(productId),
        branch: new mongoose.Types.ObjectId(branchId),
        type: 'sale',
        createdAt: { $gte: since }
    };

    const aggregation = await StockMovement.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalSold: {
                    $sum: {
                        $abs: '$quantityChange'
                    }
                }
            }
        }
    ]);

    const totalSold = normalizeQuantity(aggregation[0]?.totalSold);
    const avgDailySales = totalSold / Math.max(days, 1);

    return {
        totalSold,
        avgDailySales
    };
};

const calculateReorderPoint = (product, avgDailySales) => {
    const baseReorderLevel = normalizeQuantity(product.reorderLevel);
    const demandBasedLevel = Math.ceil(avgDailySales * 7);
    const minReorderPoint = Math.max(baseReorderLevel, demandBasedLevel, 5);
    return minReorderPoint;
};

const calculateRecommendedQuantity = (currentStock, reorderPoint, avgDailySales) => {
    const safetyStock = Math.ceil(Math.max(avgDailySales * 1.5, 5));
    const targetStock = reorderPoint + safetyStock;
    const recommended = Math.max(targetStock - normalizeQuantity(currentStock), 0);
    return recommended;
};

const buildUrgency = (currentStock, reorderPoint, recommendedQuantity) => {
    if (currentStock <= reorderPoint) return 'CRITICAL';
    if (recommendedQuantity > 0) return 'HIGH';
    return 'MEDIUM';
};

const generateReorderRecommendations = async ({ branchId = null, limit = 20, days = 30, includeAll = false } = {}) => {
    const filter = {};

    if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
        filter.branch = new mongoose.Types.ObjectId(branchId);
    }

    const inventories = await Inventory.find(filter)
        .populate('product')
        .populate('branch')
        .exec();

    const recommendations = [];

    for (const inventory of inventories) {
        if (!inventory.product || !inventory.branch) continue;

        const product = inventory.product;
        const branch = inventory.branch;
        const currentStock = normalizeQuantity(inventory.quantity);
        const supplier = product.supplier && mongoose.Types.ObjectId.isValid(product.supplier)
            ? await Supplier.findById(product.supplier).lean()
            : null;

        const { totalSold, avgDailySales } = await getSalesConsumption(product._id, branch._id, days);
        const reorderPoint = calculateReorderPoint(product, avgDailySales);
        const recommendedQuantity = calculateRecommendedQuantity(currentStock, reorderPoint, avgDailySales);
        const lowStock = currentStock <= reorderPoint;
        const urgency = buildUrgency(currentStock, reorderPoint, recommendedQuantity);

        if (!includeAll && recommendedQuantity === 0 && !lowStock) {
            continue;
        }

        const persistedRecommendation = await ReorderRecommendation.findOneAndUpdate(
            { product: product._id, branch: branch._id },
            {
                product: product._id,
                branch: branch._id,
                recommendedQuantity,
                currentStock,
                reorderPoint,
                status: lowStock ? 'PENDING' : 'PENDING'
            },
            {
                upsert: true,
                returnDocument: 'after',
                setDefaultsOnInsert: true
            }
        ).lean();

        recommendations.push({
            id: persistedRecommendation._id,
            product: {
                id: product._id,
                name: product.name,
                barcode: product.barcode,
                unit: product.unit,
                costPrice: normalizeQuantity(product.costPrice),
                supplierName: supplier?.companyName || null
            },
            supplierName: supplier?.companyName || null,
            branch: {
                id: branch._id,
                name: branch.name || branch.location || 'Branch'
            },
            currentStock,
            reorderPoint,
            recommendedQuantity,
            avgDailySales: Number(avgDailySales.toFixed(2)),
            totalSold,
            lowStock,
            urgency,
            status: persistedRecommendation.status,
            createdAt: persistedRecommendation.createdAt,
            updatedAt: persistedRecommendation.updatedAt
        });
    }

    recommendations.sort((a, b) => {
        const rating = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
        if (rating[b.urgency] !== rating[a.urgency]) {
            return rating[b.urgency] - rating[a.urgency];
        }
        return b.recommendedQuantity - a.recommendedQuantity;
    });

    return recommendations.slice(0, Math.max(Number(limit) || 20, 1));
};

const approveReorderRecommendation = async (recommendationId, userId) => {
    if (!mongoose.Types.ObjectId.isValid(recommendationId)) {
        throw new Error('Invalid recommendation ID');
    }

    const recommendation = await ReorderRecommendation.findById(recommendationId)
        .populate('product')
        .populate('branch')
        .exec();

    if (!recommendation) {
        throw new Error('Reorder recommendation not found');
    }

    if (recommendation.status === 'APPROVED') {
        throw new Error('Reorder recommendation has already been approved');
    }

    const product = await Product.findById(recommendation.product);
    const supplier = product?.supplier ? await Supplier.findById(product.supplier) : null;

    const orderQuantity = Math.max(normalizeQuantity(recommendation.recommendedQuantity), 1);
    const itemCost = normalizeQuantity(product?.costPrice);
    const totalAmount = orderQuantity * itemCost;

    const po = await PurchaseOrder.create({
        poNumber: `PO-${Date.now()}`,
        supplierName: supplier?.companyName || 'Unknown Supplier',
        supplier: supplier?._id,
        branch: recommendation.branch,
        orderDate: new Date(),
        items: [
            {
                product: recommendation.product,
                quantity: orderQuantity,
                costPrice: itemCost
            }
        ],
        status: 'Pending',
        totalAmount
    });

    recommendation.status = 'APPROVED';
    await recommendation.save();

    return {
        success: true,
        message: 'Reorder recommendation approved and purchase order created',
        purchaseOrderId: po._id,
        purchaseOrderNumber: po.poNumber,
        recommendation: {
            id: recommendation._id,
            status: recommendation.status,
            approvedBy: userId,
            approvedAt: recommendation.updatedAt
        }
    };
};

module.exports = {
    generateReorderRecommendations,
    approveReorderRecommendation
};
