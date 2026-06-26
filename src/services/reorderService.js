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

    if (!inventories.length) return [];

    // 1. Fetch all unique suppliers in bulk
    const supplierIds = [...new Set(
        inventories
            .map(inv => inv.product?.supplier)
            .filter(s => s && mongoose.Types.ObjectId.isValid(s))
            .map(s => s.toString())
    )];
    
    const suppliers = await Supplier.find({ _id: { $in: supplierIds } }).lean();
    const supplierMap = {};
    suppliers.forEach(s => supplierMap[s._id.toString()] = s);

    // 2. Fetch sales consumption for all product/branch pairs in bulk
    const since = new Date(Date.now() - Math.max(days, 1) * DAY_MS);
    const productIds = inventories.map(inv => inv.product?._id).filter(Boolean);
    const branchIds = inventories.map(inv => inv.branch?._id).filter(Boolean);

    const aggregation = await StockMovement.aggregate([
        { 
            $match: {
                product: { $in: productIds },
                branch: { $in: branchIds },
                type: 'sale',
                createdAt: { $gte: since }
            } 
        },
        {
            $group: {
                _id: { product: "$product", branch: "$branch" },
                totalSold: {
                    $sum: {
                        $abs: '$quantityChange'
                    }
                }
            }
        }
    ]);

    const salesMap = {};
    aggregation.forEach(item => {
        const key = `${item._id.product.toString()}_${item._id.branch.toString()}`;
        salesMap[key] = item.totalSold;
    });

    const recommendationsData = [];
    const bulkOps = [];

    // 3. Process each inventory item
    for (const inventory of inventories) {
        if (!inventory.product || !inventory.branch) continue;

        const product = inventory.product;
        const branch = inventory.branch;
        const currentStock = normalizeQuantity(inventory.quantity);
        const supplier = product.supplier ? supplierMap[product.supplier.toString()] : null;

        const key = `${product._id.toString()}_${branch._id.toString()}`;
        const totalSold = normalizeQuantity(salesMap[key]);
        const avgDailySales = totalSold / Math.max(days, 1);

        const reorderPoint = calculateReorderPoint(product, avgDailySales);
        const recommendedQuantity = calculateRecommendedQuantity(currentStock, reorderPoint, avgDailySales);
        const lowStock = currentStock <= reorderPoint;
        const urgency = buildUrgency(currentStock, reorderPoint, recommendedQuantity);

        if (!includeAll && recommendedQuantity === 0 && !lowStock) {
            continue;
        }

        const status = 'PENDING';

        bulkOps.push({
            updateOne: {
                filter: { product: product._id, branch: branch._id },
                update: {
                    $set: {
                        product: product._id,
                        branch: branch._id,
                        recommendedQuantity,
                        currentStock,
                        reorderPoint,
                        status
                    }
                },
                upsert: true
            }
        });

        recommendationsData.push({
            product,
            branch,
            supplier,
            currentStock,
            reorderPoint,
            recommendedQuantity,
            avgDailySales,
            totalSold,
            lowStock,
            urgency,
            status
        });
    }

    // 4. Bulk write updates
    if (bulkOps.length > 0) {
        await ReorderRecommendation.bulkWrite(bulkOps);
    }

    // 5. Re-fetch persisted recommendations to get _ids and timestamps
    const productBranchPairs = recommendationsData.map(r => ({ product: r.product._id, branch: r.branch._id }));
    let persistedMap = {};
    
    if (productBranchPairs.length > 0) {
        const persistedRecommendations = await ReorderRecommendation.find({
            $or: productBranchPairs
        }).lean();
        
        persistedRecommendations.forEach(pr => {
            const key = `${pr.product.toString()}_${pr.branch.toString()}`;
            persistedMap[key] = pr;
        });
    }

    // 6. Map to final recommendations payload
    const recommendations = recommendationsData.map(data => {
        const key = `${data.product._id.toString()}_${data.branch._id.toString()}`;
        const persisted = persistedMap[key] || {};
        
        return {
            id: persisted._id,
            product: {
                id: data.product._id,
                name: data.product.name,
                barcode: data.product.barcode,
                unit: data.product.unit,
                costPrice: normalizeQuantity(data.product.costPrice),
                supplierName: data.supplier?.companyName || null
            },
            supplierName: data.supplier?.companyName || null,
            branch: {
                id: data.branch._id,
                name: data.branch.name || data.branch.location || 'Branch'
            },
            currentStock: data.currentStock,
            reorderPoint: data.reorderPoint,
            recommendedQuantity: data.recommendedQuantity,
            avgDailySales: Number(data.avgDailySales.toFixed(2)),
            totalSold: data.totalSold,
            lowStock: data.lowStock,
            urgency: data.urgency,
            status: data.status || persisted.status,
            createdAt: persisted.createdAt,
            updatedAt: persisted.updatedAt
        };
    });

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
