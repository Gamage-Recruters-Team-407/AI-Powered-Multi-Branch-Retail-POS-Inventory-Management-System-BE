const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const Supplier = require('../models/Supplier');
const Promotion = require('../models/Promotion');
const Branch = require('../models/Branch');
const mongoose = require('mongoose');

/**
 * Get all pending decision suggestions from REAL MongoDB data.
 * Queries: Inventory (low stock), Sales (trending), Returns (high return rate),
 * Inventory+Sales (dead stock), Sales (price optimization candidates).
 */
const getPendingSuggestions = async () => {
  try {
    const actions = [];
    let actionCounter = 1;

    // ─── 1. LOW_STOCK: Real inventory items below reorder level ───
    try {
      const lowStockItems = await Inventory.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'product',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' },
        {
          $match: {
            $expr: { $lte: ['$quantity', '$productDetails.reorderLevel'] },
            'productDetails.isActive': { $ne: false }
          }
        },
        {
          $project: {
            productId: { $toString: '$product' },
            productName: '$productDetails.name',
            currentStock: '$quantity',
            reorderLevel: '$productDetails.reorderLevel',
            costPrice: '$productDetails.costPrice'
          }
        },
        { $sort: { currentStock: 1 } },
        { $limit: 10 }
      ]);

      for (const item of lowStockItems) {
        const reorderLvl = item.reorderLevel || 10;
        const suggestedQty = Math.max(reorderLvl * 2 - item.currentStock, 10);
        const urgency = item.currentStock === 0 ? 'critical' : (item.currentStock <= Math.floor(reorderLvl / 2) ? 'critical' : 'warning');

        let description;
        if (item.currentStock === 0) {
          description = `Out of stock! Minimum threshold is ${reorderLvl}. Recommend ordering ${suggestedQty} immediately.`;
        } else {
          description = `Current stock is ${item.currentStock}. Minimum threshold is ${reorderLvl}. Recommend ordering ${suggestedQty}.`;
        }

        actions.push({
          id: `action_${String(actionCounter++).padStart(3, '0')}`,
          type: 'LOW_STOCK',
          urgency,
          productId: item.productId,
          productName: item.productName,
          currentStock: item.currentStock,
          reorderLevel: reorderLvl,
          suggestedQuantity: suggestedQty,
          description,
          action: 'create_po',
          actionText: item.currentStock === 0 ? 'Emergency PO' : 'Create PO'
        });
      }
    } catch (err) {
      console.error('Decision: LOW_STOCK query failed:', err.message);
    }

    // ─── 2. TRENDING: Products with highest sales in last 7 days ───
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const trendingItems = await Sale.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo }, status: 'COMPLETED' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            productName: { $first: '$items.name' },
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.lineTotal' }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 3 }
      ]);

      for (const item of trendingItems) {
        actions.push({
          id: `action_${String(actionCounter++).padStart(3, '0')}`,
          type: 'TRENDING',
          urgency: 'info',
          productId: item._id ? item._id.toString() : 'unknown',
          productName: item.productName || 'Unknown Product',
          totalSold: item.totalSold,
          totalRevenue: item.totalRevenue,
          description: `${item.productName} sold ${item.totalSold} units this week (Rs ${item.totalRevenue?.toLocaleString() || 0} revenue). Consider a bundle offer or promotion.`,
          action: 'send_offer',
          actionText: 'Send Offer'
        });
      }
    } catch (err) {
      console.error('Decision: TRENDING query failed:', err.message);
    }

    // ─── 3. HIGH_RETURN_RATE: Products with most returns ───
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const returnData = await Return.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.name',
            returnCount: { $sum: '$items.qty' },
            totalReturnValue: { $sum: { $multiply: ['$items.qty', '$items.price'] } }
          }
        },
        { $match: { returnCount: { $gte: 2 } } },
        { $sort: { returnCount: -1 } },
        { $limit: 3 }
      ]);

      for (const item of returnData) {
        actions.push({
          id: `action_${String(actionCounter++).padStart(3, '0')}`,
          type: 'HIGH_RETURN_RATE',
          urgency: 'warning',
          productName: item._id || 'Unknown',
          returnCount: item.returnCount,
          description: `${item._id} had ${item.returnCount} returns in the last 30 days (Rs ${item.totalReturnValue?.toLocaleString() || 0} value). Consider quality inspection.`,
          action: 'inspect_quality',
          actionText: 'Flag for Inspection'
        });
      }
    } catch (err) {
      console.error('Decision: HIGH_RETURN_RATE query failed:', err.message);
    }

    // ─── 4. DEAD_STOCK: Products with no sales in last 90 days ───
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Get all products that HAVE been sold in last 90 days
      const recentlySoldProducts = await Sale.aggregate([
        { $match: { createdAt: { $gte: ninetyDaysAgo }, status: 'COMPLETED' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product' } }
      ]);
      const soldProductIds = recentlySoldProducts.map(s => s._id).filter(Boolean);

      // Find inventory items with stock but no recent sales
      const deadStockItems = await Inventory.aggregate([
        { $match: { quantity: { $gt: 0 } } },
        {
          $lookup: {
            from: 'products',
            localField: 'product',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' },
        {
          $match: {
            product: { $nin: soldProductIds },
            'productDetails.isActive': { $ne: false }
          }
        },
        {
          $project: {
            productId: { $toString: '$product' },
            productName: '$productDetails.name',
            currentStock: '$quantity'
          }
        },
        { $sort: { currentStock: -1 } },
        { $limit: 3 }
      ]);

      for (const item of deadStockItems) {
        actions.push({
          id: `action_${String(actionCounter++).padStart(3, '0')}`,
          type: 'DEAD_STOCK',
          urgency: 'critical',
          productId: item.productId,
          productName: item.productName,
          currentStock: item.currentStock,
          description: `No sales for ${item.productName} in 90 days (${item.currentStock} units in stock). Recommend clearance sale or liquidation.`,
          action: 'liquidate',
          actionText: 'Clearance Sale'
        });
      }
    } catch (err) {
      console.error('Decision: DEAD_STOCK query failed:', err.message);
    }

    // ─── 5. PRICE_OPTIMIZATION: Slow-moving products that could use a discount ───
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Products with very low sales velocity in last 30 days but still have stock
      const slowMoving = await Sale.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo }, status: 'COMPLETED' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            productName: { $first: '$items.name' },
            totalSold: { $sum: '$items.quantity' }
          }
        },
        { $match: { totalSold: { $lte: 3 } } },
        { $sort: { totalSold: 1 } },
        { $limit: 2 }
      ]);

      for (const item of slowMoving) {
        if (item._id) {
          // Check if item still has stock
          const inv = await Inventory.findOne({ product: item._id, quantity: { $gt: 5 } });
          if (inv) {
            actions.push({
              id: `action_${String(actionCounter++).padStart(3, '0')}`,
              type: 'PRICE_OPTIMIZATION',
              urgency: 'info',
              productId: item._id.toString(),
              productName: item.productName || 'Unknown',
              totalSold: item.totalSold,
              description: `${item.productName} only sold ${item.totalSold} units in 30 days with ${inv.quantity} in stock. Recommend 5-10% price drop to boost sales.`,
              action: 'update_price',
              actionText: 'Apply Discount'
            });
          }
        }
      }
    } catch (err) {
      console.error('Decision: PRICE_OPTIMIZATION query failed:', err.message);
    }

    return actions;
  } catch (error) {
    console.error('Error generating decisions from MongoDB:', error);
    return [];
  }
};


/**
 * Create a Purchase Order using REAL product data from MongoDB.
 */
const createPurchaseOrder = async (productId, quantity, supplierId) => {
  const poId = `PO-${Math.floor(Math.random() * 1000000)}`;

  // Find real product data
  let realProduct;
  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    realProduct = await Product.findById(productId);
  }
  if (!realProduct) {
    realProduct = await Product.findOne({ isActive: { $ne: false } });
  }

  if (!realProduct) {
    return { success: false, message: 'No product found to create PO for.' };
  }

  // Find a real supplier (prefer the product's own supplier)
  let supplierName = 'Default Supplier';
  try {
    let supplier;
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
      supplier = await Supplier.findById(supplierId);
    } else if (realProduct.supplier) {
      supplier = await Supplier.findById(realProduct.supplier);
    }
    if (!supplier) {
      supplier = await Supplier.findOne({ status: 'Active' });
    }
    if (supplier) {
      supplierName = supplier.companyName;
    }
  } catch (err) {
    console.error('Could not find supplier:', err.message);
  }

  // Find a real branch
  let branchName = 'Main Branch';
  try {
    const branch = await Branch.findOne({ isActive: true });
    if (branch) branchName = branch.name;
  } catch (err) {
    console.error('Could not find branch:', err.message);
  }

  const costPrice = realProduct.costPrice || realProduct.price || 20;
  const qty = quantity || 50;

  // Create the actual Purchase Order in the database
  const order = await PurchaseOrder.create({
    poNumber: poId,
    supplierName: supplierName,
    branch: branchName,
    orderDate: new Date(),
    totalAmount: qty * costPrice,
    status: 'PENDING',
    items: [{
      product: realProduct._id,
      quantity: qty,
      costPrice: costPrice
    }]
  });

  return {
    success: true,
    message: `Purchase order created successfully for ${realProduct.name}`,
    poId: poId,
    productName: realProduct.name,
    quantity: qty,
    totalAmount: qty * costPrice,
    supplierName: supplierName,
    status: 'PENDING'
  };
};

const sendOffer = async (productId, discountValue, endDateStr) => {
  try {
    let product;
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      product = await Product.findById(productId);
    }
    
    if (!product) {
      return { success: false, message: 'Product not found for the offer.' };
    }

    const endDate = endDateStr ? new Date(endDateStr) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const code = `TRENDING_${Math.floor(Math.random() * 10000)}`;

    const promotion = await Promotion.create({
      title: `Trending Offer: ${product.name}`,
      description: `Special discount offer for trending product ${product.name}`,
      discountType: 'PERCENTAGE',
      discountValue: Number(discountValue),
      startDate: new Date(),
      endDate: endDate,
      applicableProducts: [product._id],
      couponCode: code,
      isActive: true
    });

    return {
      success: true,
      message: 'Promotion created successfully',
      couponCode: code,
      promotionId: promotion._id
    };
  } catch (error) {
    console.error('Error creating offer:', error);
    return { success: false, message: 'Failed to create offer' };
  }
};

const triggerReorder = async (productId, branchId, quantity) => {
  try {
    const qty = Number(quantity);
    
    // Auto-restock: Update inventory directly
    const inventory = await Inventory.findOneAndUpdate(
      { product: productId, branch: branchId },
      { $inc: { quantity: qty } },
      { new: true }
    );

    if (!inventory) {
      return { success: false, message: 'Inventory record not found for this branch.' };
    }

    // Create a Purchase Order marked as RECEIVED for the audit trail
    const result = await createPurchaseOrder(productId, qty, null);
    if (result.success && result.poId) {
      await PurchaseOrder.updateOne(
        { poNumber: result.poId },
        { $set: { status: 'RECEIVED' } }
      );
    }

    return {
      success: true,
      message: `Successfully restocked ${qty} units. New stock is ${inventory.quantity}.`,
      status: 'COMPLETED',
      poId: result.success ? result.poId : null
    };
  } catch (error) {
    console.error('Error auto-restocking:', error);
    return { success: false, message: 'Failed to auto-restock' };
  }
};

const approveAllPending = async () => {
  try {
    const result = await PurchaseOrder.updateMany(
      { status: 'PENDING' },
      { $set: { status: 'APPROVED' } }
    );
    return {
      success: true,
      message: `${result.modifiedCount} pending actions approved`,
      count: result.modifiedCount
    };
  } catch (err) {
    console.error('Error approving pending POs:', err.message);
    return {
      success: false,
      message: 'Failed to approve pending actions',
      count: 0
    };
  }
};

module.exports = {
  getPendingSuggestions,
  createPurchaseOrder,
  sendOffer,
  triggerReorder,
  approveAllPending
};
