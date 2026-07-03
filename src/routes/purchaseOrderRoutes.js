const express = require('express');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Inventory = require('../models/Inventory');
const inventoryService = require('../services/inventoryService');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

const isMongoConnected = () => mongoose.connection.readyState === 1;

const toDisplayStatus = (status) => {
  const normalized = String(status || 'Pending').trim().toUpperCase();

  if (normalized === 'APPROVED') return 'Approved';
  if (normalized === 'REJECTED') return 'Rejected';
  if (normalized === 'RECEIVED') return 'Received';
  if (normalized === 'CANCELLED') return 'Rejected';
  return 'Pending';
};

const toBranchName = (branch) => {
  if (!branch) return '';
  if (typeof branch === 'string') return branch;
  if (typeof branch === 'object') {
    return branch.name || branch.branchName || branch.label || String(branch._id || '');
  }
  return String(branch);
};

const requireMongoConnection = (req, res, next) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      message: 'MongoDB is not connected yet. Check MONGO_URI, DB_NAME, and Atlas network access.',
    });
  }

  next();
};

const formatOrder = (order) => ({
  id: order._id,
  po: order.poNumber,
  supplier: order.supplierName,
  branch: toBranchName(order.branch),
  date: new Date(order.orderDate).toISOString().slice(0, 10),
  expectedDate: order.expectedDate
    ? new Date(order.expectedDate).toISOString().slice(0, 10)
    : new Date(order.orderDate).toISOString().slice(0, 10),
  amount: `$${order.totalAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`,
  status: toDisplayStatus(order.status),
  priority: order.priority || 'Normal',
  category: order.category || 'Mixed Stock',
  owner: order.owner || 'Procurement Team',
  items: Number.isFinite(order.itemCount) && order.itemCount > 0
    ? order.itemCount
    : Array.isArray(order.items)
      ? order.items.length
      : 0,
});

const parseBranchValue = (branch) => {
  if (!branch) return null;

  if (branch instanceof mongoose.Types.ObjectId) {
    return branch;
  }

  if (typeof branch === 'string') {
    const trimmedBranch = branch.trim();
    if (mongoose.Types.ObjectId.isValid(trimmedBranch)) {
      return new mongoose.Types.ObjectId(trimmedBranch);
    }
    return trimmedBranch;
  }

  if (typeof branch === 'object' && branch._id && mongoose.Types.ObjectId.isValid(branch._id)) {
    return new mongoose.Types.ObjectId(branch._id);
  }

  return branch;
};

const toBranchId = (branch) => {
  if (!branch) return null;

  if (branch instanceof mongoose.Types.ObjectId) {
    return branch;
  }

  if (typeof branch === 'string' && mongoose.Types.ObjectId.isValid(branch)) {
    return new mongoose.Types.ObjectId(branch);
  }

  if (typeof branch === 'object' && branch._id && mongoose.Types.ObjectId.isValid(branch._id)) {
    return new mongoose.Types.ObjectId(branch._id);
  }

  return null;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      product: item?.product,
      quantity: Number(item?.quantity),
      costPrice: Number(item?.costPrice),
    }))
    .filter((item) => item.product && Number.isFinite(item.quantity) && item.quantity > 0)
    .map((item) => ({
      product: item.product,
      quantity: item.quantity,
      costPrice: Number.isFinite(item.costPrice) && item.costPrice >= 0 ? item.costPrice : 0,
    }));
};

const ensureReceivableOrder = (order) => {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('Purchase order cannot be marked as Received without item lines.');
  }

  const invalidItem = order.items.find(
    (item) => !item.product || !mongoose.Types.ObjectId.isValid(item.product) || !(Number(item.quantity) > 0),
  );

  if (invalidItem) {
    throw new Error('Each purchase order item must include a valid product and quantity before receiving stock.');
  }

  const branchId = toBranchId(order.branch);
  if (!branchId) {
    throw new Error('Purchase order branch must be a valid branch ID before receiving stock.');
  }

  return branchId;
};

const findOrCreateInventory = async ({ productId, branchId, session }) => {
  const existingInventory = await Inventory.findOne({ product: productId, branch: branchId }).session(session);
  if (existingInventory) return existingInventory;

  const inventory = new Inventory({
    product: productId,
    branch: branchId,
    quantity: 0,
    reservedStock: 0,
    lowStockAlert: false,
  });

  await inventory.save({ session });
  return inventory;
};

router.get('/', async (req, res) => {
  if (!isMongoConnected()) {
    return res.json([]);
  }

  const orders = await PurchaseOrder.find().sort({ createdAt: -1 });
  res.json(orders.map(formatOrder));
});

router.post('/', requireMongoConnection, async (req, res) => {
  const {
    supplier,
    supplierId,
    branch,
    date,
    expectedDate,
    amount,
    priority,
    category,
    items,
    owner,
  } = req.body;
  const normalizedItems = normalizeItems(items);
  const computedAmount = normalizedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) * Number(item.costPrice || 0)),
    0,
  );
  const totalAmount = Number.isFinite(Number(amount)) && Number(amount) > 0
    ? Number(amount)
    : computedAmount;
  const orderDate = new Date(date);
  const deliveryDate = expectedDate ? new Date(expectedDate) : orderDate;
  const itemCount = normalizedItems.length > 0
    ? normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    : Number(items);

  if (!supplier || !branch || !date || (!amount && normalizedItems.length === 0)) {
    return res.status(400).json({
      message: 'Supplier, branch, date, and either amount or item lines are required.',
    });
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number.' });
  }

  if (Number.isNaN(orderDate.getTime())) {
    return res.status(400).json({ message: 'Order date must be a valid date.' });
  }

  if (Number.isNaN(deliveryDate.getTime())) {
    return res.status(400).json({ message: 'Expected date must be a valid date.' });
  }

  const count = await PurchaseOrder.countDocuments();
  const order = await PurchaseOrder.create({
    poNumber: `PO-2026-${1049 + count}`,
    supplierName: supplier.trim(),
    supplier: supplierId && mongoose.Types.ObjectId.isValid(supplierId)
      ? new mongoose.Types.ObjectId(supplierId)
      : undefined,
    branch: parseBranchValue(branch),
    orderDate,
    expectedDate: deliveryDate,
    totalAmount,
    priority: ['Low', 'Normal', 'Medium', 'High'].includes(priority) ? priority : 'Normal',
    category: category?.trim() || 'Mixed Stock',
    itemCount: Number.isFinite(itemCount) && itemCount > 0 ? itemCount : 1,
    owner: owner?.trim() || 'Procurement Team',
    items: normalizedItems,
    status: 'Pending',
  });

  res.status(201).json(formatOrder(order));
});

router.patch(
  '/:id/status',
  protect,
  authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'admin', 'manager'),
  requireMongoConnection,
  async (req, res) => {
    const { status } = req.body;

    if (!['Pending', 'Approved', 'Rejected', 'Received'].includes(status)) {
      return res.status(400).json({ message: 'Invalid purchase order status.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await PurchaseOrder.findById(req.params.id).session(session);

      if (!order) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Purchase order not found.' });
      }

      const wasReceived = toDisplayStatus(order.status) === 'Received';
      const willBeReceived = status === 'Received';
      const inventoryUpdates = [];

      if (!wasReceived && willBeReceived) {
        const branchId = ensureReceivableOrder(order);

        for (const item of order.items) {
          const inventory = await findOrCreateInventory({
            productId: item.product,
            branchId,
            session,
          });

          const updateResult = await inventoryService.updateInventoryStock(
            {
              inventoryId: inventory._id,
              quantityChange: Number(item.quantity),
              type: 'purchase',
              reason: `Purchase order received: ${order.poNumber}`,
              referenceId: order._id,
              userId: req.user._id,
            },
            session,
          );

          inventoryUpdates.push({
            inventoryId: updateResult.inventoryId,
            productId: updateResult.productId,
            quantityReceived: Number(item.quantity),
            newQuantity: updateResult.newQuantity,
          });
        }
      }

      order.status = status;
      await order.save({ session });
      await session.commitTransaction();

      res.json({
        ...formatOrder(order),
        inventoryUpdated: inventoryUpdates.length > 0,
        inventoryUpdates,
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(400).json({ message: error.message });
    } finally {
      session.endSession();
    }
  },
);

module.exports = router;
