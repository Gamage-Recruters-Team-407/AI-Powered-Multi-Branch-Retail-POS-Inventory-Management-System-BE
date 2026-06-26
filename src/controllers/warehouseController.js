const mongoose = require("mongoose");
const Warehouse = require("../models/Warehouse");
const WarehouseZone = require("../models/WarehouseZone");
const WarehouseStock = require("../models/WarehouseStock");
const WarehouseTransaction = require("../models/WarehouseTransaction");
const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const systemEvents = require("../events/eventBus");
const StockMovement = require("../models/StockMovement");

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

    const zones = await WarehouseZone.find({ warehouse: req.params.id, isActive: true });
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
    const warehouseId = req.params.id;

    const warehouseStockTotals = await WarehouseStock.aggregate([
      { $match: { warehouse: new mongoose.Types.ObjectId(warehouseId) } },
      {
        $group: {
          _id:           "$product",
          totalQuantity: { $sum: "$quantity" },
          minStock:      { $min: "$minStock" },
          zones: {
            $push: {
              zone:     "$zone",
              quantity: "$quantity",
              batchNo:  "$batchNo",
            },
          },
        },
      },
    ]);

    const wsMap = new Map(
      warehouseStockTotals.map((s) => [String(s._id), s])
    );

    const inventoryTotals = await Inventory.aggregate([
      {
        $group: {
          _id:           "$product",
          totalQuantity: { $sum: "$quantity" }, 
          reserved:      { $sum: "$reservedStock" },
        },
      },
    ]);

    const invMap = new Map(
      inventoryTotals.map((i) => [String(i._id), i])
    );

    const allProducts = await Product.find({ isActive: true })
      .select("name sku barcode price costPrice image unit reorderLevel category")
      .populate("category", "name")
      .lean();

    const result = allProducts.map((p) => {
      const ws  = wsMap.get(String(p._id));
      const inv = invMap.get(String(p._id));

      const totalQty  = p.reorderLevel ?? 0;
      const reserved  = inv?.reserved ?? 0;
      const minStock  = ws?.minStock ?? 10;
      
      const isLowStock   = totalQty > 0 && totalQty <= minStock;
      const isUnstocked  = totalQty === 0;

      return {
        _id:           p._id,
        product:       p,
        quantity:      totalQty,
        reservedStock: reserved,
        availableQty:  Math.max(0, totalQty - reserved),
        minStock,
        isLowStock,
        isUnstocked,
        zones:         ws?.zones ?? [],
        source:        "product_reorder_level", 
      };
    });

    result.sort((a, b) => {
      if (a.isUnstocked !== b.isUnstocked) return a.isUnstocked ? 1 : -1;
      return (a.product.name || "").localeCompare(b.product.name || "");
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/warehouses/:id/stock/add
const addStock = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Warehouse stock update directly disabled. Go to Product Management → Edit Product → Stock tab.",
    info: "Warehouse stock view is read-only. Use Product Management to update inventory."
  });
};

// POST /api/warehouses/:id/stock/remove
const removeStock = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Warehouse stock removal directly disabled. Go to Product Management → Edit Product → Stock tab.",
    info: "Warehouse stock view is read-only. Use Product Management to update inventory."
  });
};

// POST /api/warehouses/transfer
const transferStock = async (req, res) => {
  try {
    const { fromWarehouse, fromZone, toWarehouse, toZone, product, quantity, toBranch, note } = req.body;

    const qty = Number(quantity);
    let totalDeduction = qty;
    let branchesToDistribute = [];

    if (toBranch === "all") {
      const Branch = require("../models/Branch");
      branchesToDistribute = await Branch.find({});
      totalDeduction = qty * branchesToDistribute.length;
    }

    const sourceStock = await WarehouseStock.findOne({ warehouse: fromWarehouse, zone: fromZone, product });
    if (!sourceStock || sourceStock.quantity < totalDeduction) {
      return res.status(400).json({ message: `Insufficient stock in source warehouse. Requires ${totalDeduction} units total.` });
    }

    sourceStock.quantity -= Number(totalDeduction);
    await sourceStock.save();
    await WarehouseZone.findByIdAndUpdate(fromZone, { $inc: { currentStock: -Number(totalDeduction) } });

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

    if (toBranch) {
      const io = req.app.get("io");
      const productObjectId = new mongoose.Types.ObjectId(product);

      if (toBranch === "all") {
        for (const branch of branchesToDistribute) {
          const branchId = branch._id;
          let branchInventory = await Inventory.findOne({ branch: branchId, product: productObjectId });
          if (!branchInventory) {
            branchInventory = new Inventory({
              branch: branchId,
              product: productObjectId,
              quantity: 0,
              reservedStock: 0,
              lowStockAlert: false
            });
          }

          const oldQuantity = branchInventory.quantity;
          branchInventory.quantity += Number(qty);
          branchInventory.lowStockAlert = branchInventory.quantity < 50;
          await branchInventory.save();

          if (io) {
            const socketRoom = `branch_${branchId.toString()}`;
            io.to(socketRoom).emit("stockUpdated", {
              inventoryId: branchInventory._id,
              productId: productObjectId,
              branchId,
              newQuantity: branchInventory.quantity,
              oldQuantity: oldQuantity,
              movementType: "transfer_in"
            });
          }
        }
      } else {
        const branchId = new mongoose.Types.ObjectId(toBranch);
        let branchInventory = await Inventory.findOne({ branch: branchId, product: productObjectId });
        if (!branchInventory) {
          branchInventory = new Inventory({
            branch: branchId,
            product: productObjectId,
            quantity: 0,
            reservedStock: 0,
            lowStockAlert: false
          });
        }

        const oldQuantity = branchInventory.quantity;
        branchInventory.quantity += Number(qty);
        branchInventory.lowStockAlert = branchInventory.quantity < 50;
        await branchInventory.save();

        if (io) {
          const socketRoom = `branch_${toBranch}`;
          io.to(socketRoom).emit("stockUpdated", {
            inventoryId: branchInventory._id,
            productId: productObjectId,
            branchId,
            newQuantity: branchInventory.quantity,
            oldQuantity: oldQuantity,
            movementType: "transfer_in"
          });
        }
      }
    }

    await WarehouseTransaction.create({
      warehouse: fromWarehouse, zone: fromZone, product,
      type: "TRANSFER_OUT", quantity: totalDeduction,
      toBranch: toBranch === "all" ? undefined : toBranch || undefined,
      performedBy: req.user?.id,
      note: toBranch === "all" ? `${note || ""} (Distributed to all branches)` : note,
    });

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

// GET /api/warehouses/:id/stats
const getWarehouseStats = async (req, res) => {
  try {
    const warehouseId = req.params.id;

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });

    const zones = await WarehouseZone.find({ warehouse: warehouseId, isActive: true });
    const totalUsed = zones.reduce((sum, z) => sum + z.currentStock, 0);
    const usagePercent = ((totalUsed / warehouse.capacity) * 100).toFixed(1);

    const lowStockItems = await WarehouseStock.find({ warehouse: warehouseId })
      .where("quantity").lte(10)
      .populate("product", "name sku");

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

// POST /api/warehouses/:id/dispatch
const dispatchToBranch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { product, quantity, branchId, zone, note } = req.body;
    const warehouseId = req.params.id;
    const userId = req.user?._id;

    if (!product || !quantity || !branchId) {
      return res.status(400).json({ success: false, message: "product, quantity, branchId are required" });
    }
    const qty = Number(quantity);
    if (qty < 1) return res.status(400).json({ success: false, message: "Quantity must be at least 1" });

    const stockQuery = zone
      ? { warehouse: warehouseId, product, zone }
      : { warehouse: warehouseId, product };

    const warehouseStock = await WarehouseStock.findOne(stockQuery).session(session);
    if (!warehouseStock || warehouseStock.quantity < qty) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient warehouse stock. Available: ${warehouseStock?.quantity ?? 0}`
      });
    }

    warehouseStock.quantity -= qty;
    await warehouseStock.save({ session });

    if (zone) {
      await WarehouseZone.findByIdAndUpdate(zone, { $inc: { currentStock: -qty } }, { session });
    }

    let inventory = await Inventory.findOne({ product, branch: branchId }).session(session);
    if (inventory) {
      inventory.quantity += qty;
      const prod = await Product.findById(product).session(session);
      if (prod?.reorderLevel) {
        inventory.lowStockAlert = inventory.quantity <= prod.reorderLevel;
      }
      await inventory.save({ session });
    } else {
      const newInv = await Inventory.create(
        [{ product, branch: branchId, quantity: qty, lowStockAlert: false }],
        { session }
      );
      inventory = newInv[0];
    }

    await WarehouseTransaction.create(
      [{
        warehouse: warehouseId,
        zone: zone || null,
        product,
        type: "DISPATCH",
        quantity: qty,
        toBranch: branchId,
        performedBy: userId,
        note: note || `Dispatched to branch ${branchId}`,
      }],
      { session }
    );

    await StockMovement.create(
      [{
        product,
        branch: branchId,
        quantityChange: qty,
        type: "transfer_in",
        reason: note || `Received from warehouse ${warehouseId}`,
        referenceId: warehouseId,
        user: userId,
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    systemEvents.emit("SEND_ALERT", {
      target: { branchId, role: "Manager" },
      category: "INVENTORY",
      type: "INFO",
      title: "Stock Dispatched",
      message: `${qty} units dispatched from warehouse to your branch.`,
      channels: ["in-app"],
    });

    res.status(200).json({
      success: true,
      message: `${qty} units dispatched to branch successfully.`,
      data: {
        warehouseStockRemaining: warehouseStock.quantity,
        branchInventoryQuantity: inventory.quantity,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// MAIN WAREHOUSE FUNCTIONS
// ─────────────────────────────────────────────

// GET /api/warehouses/main
const getMainWarehouse = async (req, res) => {
  try {
    let warehouse = await Warehouse.findOne({ isMain: true, isActive: true })
      .populate("manager", "name email");

    if (!warehouse) {
      warehouse = await Warehouse.findOne({ isActive: true })
        .populate("manager", "name email");
    }

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "No warehouses found in the system.",
      });
    }

    const zones = await WarehouseZone.find({ warehouse: warehouse._id, isActive: true });
    const totalUsed = zones.reduce((sum, z) => sum + (z.currentStock || 0), 0);
    const usagePercent = warehouse.capacity > 0
      ? ((totalUsed / warehouse.capacity) * 100).toFixed(1)
      : "0.0";

    res.json({
      success: true,
      data: { ...warehouse.toObject(), zones, totalUsed, usagePercent },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/warehouses/:id/set-main
const setMainWarehouse = async (req, res) => {
  try {
    const { id } = req.params;

    const warehouse = await Warehouse.findById(id);
    if (!warehouse || !warehouse.isActive) {
      return res.status(404).json({ success: false, message: "Warehouse not found" });
    }

    await Warehouse.updateMany({ isMain: true }, { $set: { isMain: false } });
    warehouse.isMain = true;
    await warehouse.save();

    res.json({
      success: true,
      message: `"${warehouse.name}" main warehouse has been set successfully.`,
      data: warehouse,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/warehouses/main/products
const getMainWarehouseProducts = async (req, res) => {
  try {
    let warehouse = await Warehouse.findOne({ isMain: true, isActive: true });
    if (!warehouse) {
      warehouse = await Warehouse.findOne({ isActive: true });
    }
    if (!warehouse) {
      return res.status(404).json({ success: false, message: "No warehouses found in the system." });
    }

    const { search, page = 1, limit = 20, lowStock } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const aggregatePipeline = [
      { $match: { warehouse: warehouse._id } },
      {
        $group: {
          _id: "$product",
          totalQuantity: { $sum: "$quantity" },
          minStock:      { $min: "$minStock" },
          zones: {
            $push: { zone: "$zone", quantity: "$quantity", batchNo: "$batchNo" },
          },
        },
      },
      {
        $lookup: {
          from: "products", localField: "_id", foreignField: "_id", as: "productInfo",
        },
      },
      { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
    ];

    if (search && search.trim()) {
      aggregatePipeline.push({
        $match: {
          $or: [
            { "productInfo.name":    { $regex: search.trim(), $options: "i" } },
            { "productInfo.barcode": { $regex: search.trim(), $options: "i" } },
          ],
        },
      });
    }

    if (lowStock === "true") {
      aggregatePipeline.push({
        $match: { $expr: { $lte: ["$productInfo.reorderLevel", 10] } },
      });
    }

    aggregatePipeline.push({
      $lookup: {
        from: "categories", localField: "productInfo.category", foreignField: "_id", as: "categoryInfo",
      },
    });

    const countResult = await WarehouseStock.aggregate([...aggregatePipeline, { $count: "total" }]);
    const total       = countResult[0]?.total || 0;

    aggregatePipeline.push(
      { $sort: { "productInfo.name": 1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
      {
        $project: {
          _id:           0,
          productId:     "$_id",
          name:          "$productInfo.name",
          barcode:       "$productInfo.barcode",
          brand:         "$productInfo.brand",
          category:      { $arrayElemAt: ["$categoryInfo.name", 0] },
          price:         "$productInfo.price",
          costPrice:     "$productInfo.costPrice",
          unit:          "$productInfo.unit",
          image:         "$productInfo.image",
          reorderLevel:  "$productInfo.reorderLevel",
          totalQuantity: { $ifNull: ["$productInfo.reorderLevel", 0] }, 
          minStock:      { $literal: 10 },
          isLowStock:    { $lte: [{ $ifNull: ["$productInfo.reorderLevel", 0] }, 10] },
          zones:         1,
        },
      }
    );

    const products = await WarehouseStock.aggregate(aggregatePipeline);

    res.json({
      success: true,
      warehouseId:   warehouse._id,
      warehouseName: warehouse.name,
      total,
      page:          pageNum,
      pages:         Math.ceil(total / limitNum),
      data:          products,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// SINGLE EXPORTS BLOCK — ALL FUNCTIONS
// ─────────────────────────────────────────────
module.exports = {
  // Warehouse CRUD
  getAllWarehouses, getWarehouseById, createWarehouse, updateWarehouse, deleteWarehouse,
  // Zones
  getZonesByWarehouse, createZone, updateZone, deleteZone,
  // Stock
  getWarehouseStock, addStock, removeStock, transferStock, dispatchToBranch,
  // Reports
  getTransactions, getWarehouseStats,
  // Main Warehouse
  getMainWarehouse, setMainWarehouse, getMainWarehouseProducts,
};