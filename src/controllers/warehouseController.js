const Warehouse = require("../models/Warehouse");
const WarehouseZone = require("../models/WarehouseZone");
const WarehouseStock = require("../models/WarehouseStock");
const WarehouseTransaction = require("../models/WarehouseTransaction");
const systemEvents = require("../events/eventBus");

// ─────────────────────────────────────────────
// WAREHOUSE CRUD
// ─────────────────────────────────────────────

// GET /api/warehouses
const getAllWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true }).populate("manager", "name email");
    res.json({ success: true, data: warehouses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/warehouses/:id
const getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id).populate("manager", "name email");
    if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });

    // Get zones for this warehouse
    const zones = await WarehouseZone.find({ warehouse: req.params.id, isActive: true });

    // Calculate total used capacity
    const totalUsed = zones.reduce((sum, z) => sum + z.currentStock, 0);
    const usagePercent = ((totalUsed / warehouse.capacity) * 100).toFixed(1);

    res.json({ success: true, data: { ...warehouse.toObject(), zones, totalUsed, usagePercent } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/warehouses
const createWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.create(req.body);
    res.status(201).json({ success: true, data: warehouse });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/warehouses/:id
const updateWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
    if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });
    res.json({ success: true, data: warehouse });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/warehouses/:id  (soft delete)
const deleteWarehouse = async (req, res) => {
  try {
    await Warehouse.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: "Warehouse deactivated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// ZONE CRUD
// ─────────────────────────────────────────────

// GET /api/warehouses/:id/zones
const getZonesByWarehouse = async (req, res) => {
  try {
    const zones = await WarehouseZone.find({ warehouse: req.params.id, isActive: true });
    res.json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/warehouses/:id/zones
const createZone = async (req, res) => {
  try {
    const zone = await WarehouseZone.create({ ...req.body, warehouse: req.params.id });
    res.status(201).json({ success: true, data: zone });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/zones/:zoneId
const updateZone = async (req, res) => {
  try {
    const zone = await WarehouseZone.findByIdAndUpdate(req.params.zoneId, req.body, { returnDocument: 'after' });
    if (!zone) return res.status(404).json({ message: "Zone not found" });
    res.json({ success: true, data: zone });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/zones/:zoneId
const deleteZone = async (req, res) => {
  try {
    await WarehouseZone.findByIdAndUpdate(req.params.zoneId, { isActive: false });
    res.json({ success: true, message: "Zone deactivated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// STOCK MANAGEMENT
// ─────────────────────────────────────────────

// GET /api/warehouses/:id/stock
const getWarehouseStock = async (req, res) => {
  try {
    const stock = await WarehouseStock.find({ warehouse: req.params.id })
      .populate("product", "name sku barcode price")
      .populate("zone", "zoneName zoneCode");

    // Flag low stock items
    const stockWithAlerts = stock.map((s) => ({
      ...s.toObject(),
      isLowStock: s.quantity <= s.minStock,
    }));

    res.json({ success: true, data: stockWithAlerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/warehouses/:id/stock/add  — Add stock IN
const addStock = async (req, res) => {
  try {
    const { zone, product, quantity, batchNo, expiryDate, note } = req.body;
    const warehouseId = req.params.id;

    // Update or create stock record
    let stockRecord = await WarehouseStock.findOne({ warehouse: warehouseId, zone, product });
    if (stockRecord) {
      stockRecord.quantity += Number(quantity);
      await stockRecord.save();
    } else {
      stockRecord = await WarehouseStock.create({ warehouse: warehouseId, zone, product, quantity, batchNo, expiryDate });
    }

    // Update zone currentStock
    await WarehouseZone.findByIdAndUpdate(zone, { $inc: { currentStock: Number(quantity) } });

    // Record transaction
    await WarehouseTransaction.create({
      warehouse: warehouseId, zone, product,
      type: "IN", quantity,
      reference: batchNo || "MANUAL",
      performedBy: req.user?.id,
      note,
    });

    res.status(201).json({ success: true, message: "Stock added", data: stockRecord });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/warehouses/:id/stock/remove  — Remove stock OUT
const removeStock = async (req, res) => {
  try {
    const { zone, product, quantity, note } = req.body;
    const warehouseId = req.params.id;

    const stockRecord = await WarehouseStock.findOne({ warehouse: warehouseId, zone, product });
    if (!stockRecord || stockRecord.quantity < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    stockRecord.quantity -= Number(quantity);
    await stockRecord.save();

    await WarehouseZone.findByIdAndUpdate(zone, { $inc: { currentStock: -Number(quantity) } });

    await WarehouseTransaction.create({
      warehouse: warehouseId, zone, product,
      type: "OUT", quantity,
      performedBy: req.user?.id,
      note,
    });

    res.json({ success: true, message: "Stock removed", data: stockRecord });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/warehouses/transfer  — Transfer stock between warehouses/branches
const transferStock = async (req, res) => {
  try {
    const { fromWarehouse, fromZone, toWarehouse, toZone, product, quantity, toBranch, note } = req.body;

    // Check source stock
    const sourceStock = await WarehouseStock.findOne({ warehouse: fromWarehouse, zone: fromZone, product });
    if (!sourceStock || sourceStock.quantity < quantity) {
      return res.status(400).json({ message: "Insufficient stock in source warehouse" });
    }

    // Deduct from source
    sourceStock.quantity -= Number(quantity);
    await sourceStock.save();
    await WarehouseZone.findByIdAndUpdate(fromZone, { $inc: { currentStock: -Number(quantity) } });

    // Add to destination (if warehouse-to-warehouse)
    if (toWarehouse && toZone) {
      let destStock = await WarehouseStock.findOne({ warehouse: toWarehouse, zone: toZone, product });
      if (destStock) {
        destStock.quantity += Number(quantity);
        await destStock.save();
      } else {
        await WarehouseStock.create({ warehouse: toWarehouse, zone: toZone, product, quantity });
      }
      await WarehouseZone.findByIdAndUpdate(toZone, { $inc: { currentStock: Number(quantity) } });

      await WarehouseTransaction.create({ warehouse: toWarehouse, zone: toZone, product, type: "TRANSFER_IN", quantity, fromBranch: fromWarehouse, performedBy: req.user?.id, note });
    }

    // Record TRANSFER_OUT
    await WarehouseTransaction.create({
      warehouse: fromWarehouse, zone: fromZone, product,
      type: "TRANSFER_OUT", quantity,
      toBranch: toBranch || toWarehouse,
      performedBy: req.user?.id,
      note,
    });

    // Trigger a notification
    systemEvents.emit('SEND_ALERT', {
      target: { role: 'Admin' }, 
      category: 'INVENTORY',
      type: 'INFO',
      title: 'Warehouse Stock Transfer',
      message: `Successfully transferred ${quantity} units of product ${product}.`,
      channels: ['in-app']
    });

    res.json({ success: true, message: "Stock transferred successfully" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// TRANSACTIONS & REPORTS
// ─────────────────────────────────────────────

// GET /api/warehouses/:id/transactions
const getTransactions = async (req, res) => {
  try {
    const { type, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = { warehouse: req.params.id };

    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await WarehouseTransaction.countDocuments(filter);
    const transactions = await WarehouseTransaction.find(filter)
      .populate("product", "name sku")
      .populate("zone", "zoneName")
      .populate("performedBy", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, data: transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/warehouses/:id/stats  — Dashboard statistics
const getWarehouseStats = async (req, res) => {
  try {
    const warehouseId = req.params.id;

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });

    const zones = await WarehouseZone.find({ warehouse: warehouseId, isActive: true });
    const totalUsed = zones.reduce((sum, z) => sum + z.currentStock, 0);
    const usagePercent = ((totalUsed / warehouse.capacity) * 100).toFixed(1);

    // Low stock items
    const lowStockItems = await WarehouseStock.find({ warehouse: warehouseId })
      .where("quantity").lte(10)
      .populate("product", "name sku");

    // Transaction summary (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const txSummary = await WarehouseTransaction.aggregate([
      { $match: { warehouse: warehouse._id, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: "$type", totalQty: { $sum: "$quantity" }, count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        warehouseName: warehouse.name,
        totalCapacity: warehouse.capacity,
        totalUsed,
        usagePercent,
        totalZones: zones.length,
        lowStockCount: lowStockItems.length,
        lowStockItems,
        transactionSummary: txSummary,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllWarehouses, getWarehouseById, createWarehouse, updateWarehouse, deleteWarehouse,
  getZonesByWarehouse, createZone, updateZone, deleteZone,
  getWarehouseStock, addStock, removeStock, transferStock,
  getTransactions, getWarehouseStats,
};
