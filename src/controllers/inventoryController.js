const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const StockMovement = require("../models/StockMovement");
const Product = require("../models/Product");
const inventoryService = require("../services/inventoryService");
const systemEvents = require("../events/eventBus");
const { isMongoConnected } = require("../middleware/requireMongoConnection");

/**
 * @api {get} /api/inventory Fetch inventory with filtering
 * @apiDescription Get inventory list with optional filters for branch, product, and low-stock flag. Populates product and branch.
 * @apiParam {String} [branch] Branch ID filter
 * @apiParam {String} [product] Product ID filter
 * @apiParam {Boolean} [lowStock] Low stock flag filter
 * @apiSuccess {Boolean} success Status indicator
 * @apiSuccess {Array} data List of inventory items
 */
const getInventory = async (req, res, next) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, count: 0, data: [] });
    }
    try {
        const { branch, product, lowStock } = req.query;
        const filter = {};

        if (branch) {
            filter.branch = new mongoose.Types.ObjectId(branch);
        }
        if (product) {
            filter.product = new mongoose.Types.ObjectId(product);
        }
        if (lowStock !== undefined) {
            filter.lowStockAlert = lowStock === "true";
        }

        const items = await Inventory.find(filter)
            .populate("product")
            .populate("branch")
            .exec();

        res.status(200).json({
            success: true,
            count: items.length,
            data: items
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @api {get} /api/inventory/:id Fetch single inventory record
 * @apiDescription Get detailed inventory profile by ID.
 * @apiParam {String} id Inventory ID
 * @apiSuccess {Boolean} success Status indicator
 * @apiSuccess {Object} data Inventory record detail
 */
const getInventoryById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: "Invalid Inventory ID format"
            });
        }

        const item = await Inventory.findById(id)
            .populate("product")
            .populate("branch")
            .exec();

        if (!item) {
            return res.status(404).json({
                success: false,
                error: `Inventory record with ID ${id} not found`
            });
        }

        res.status(200).json({
            success: true,
            data: item
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @api {put} /api/inventory/stock Update stock (increase/decrease)
 * @apiDescription Core method to update stock. Uses MongoDB sessions/transactions to prevent race conditions and validates quantities.
 * @apiBody {String} inventoryId Inventory ID to update
 * @apiBody {Number} quantityChange Positive or negative integer of inventory quantity shift
 * @apiBody {String} type Movement type enum ("sale", "purchase", "return", "transfer_out", "transfer_in", "adjustment")
 * @apiBody {String} reason Explanation details for auditing
 * @apiBody {String} [referenceId] ID linking to corresponding Sale, Return, PO, or StockTransfer
 * @apiBody {String} branchId Associated branch ID
 */
const updateStock = async (req, res, next) => {
    // Start Mongoose transaction session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { inventoryId, quantityChange, type, reason, referenceId, branchId } = req.body;
        const userId = req.user._id;

        // Perform stock update using transaction session in the service layer
        const result = await inventoryService.updateInventoryStock(
            {
                inventoryId,
                quantityChange: Number(quantityChange),
                type,
                reason,
                referenceId,
                userId
            },
            session
        );

        // Commit transaction since operations succeeded without throwing errors
        await session.commitTransaction();
        session.endSession();

        // Socket.io Real-time emissions
        const io = req.app.get("io");
        if (io) {
            const socketRoom = `branch_${result.branchId}`;
            
            // Emit stockUpdated event to branch room
            io.to(socketRoom).emit("stockUpdated", {
                inventoryId: result.inventoryId,
                productId: result.productId,
                branchId: result.branchId,
                newQuantity: result.newQuantity,
                oldQuantity: result.oldQuantity,
                movementType: result.movementType
            });

            // Emit lowStockAlert if the update causes stock to fall to or below the reorder point
            if (result.lowStockAlert) {
                io.to(socketRoom).emit("lowStockAlert", {
                    inventoryId: result.inventoryId,
                    productId: result.productId,
                    branchId: result.branchId,
                    quantity: result.newQuantity,
                    message: `Product stock level has fallen below the reorder point.`
                });

                systemEvents.emit('SEND_ALERT', {
                    target: { branchId: result.branchId, role: 'Manager' },
                    category: 'INVENTORY',
                    type: 'WARNING',
                    title: 'Low Stock Alert',
                    message: `Stock level has fallen below the reorder point. Current quantity: ${result.newQuantity}.`,
                    channels: ['in-app', 'email', 'sms'],
                });
            }
        }

        res.status(200).json({
            success: true,
            message: "Stock updated successfully",
            data: {
                inventoryId: result.inventoryId,
                productId: result.productId,
                branchId: result.branchId,
                oldQuantity: result.oldQuantity,
                newQuantity: result.newQuantity,
                lowStockAlert: result.lowStockAlert,
                movement: result.movement
            }
        });
    } catch (error) {
        // Abort transactions on any exception to restore database state integrity
        await session.abortTransaction();
        session.endSession();
        
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * @api {get} /api/inventory/history Fetch movement logs
 * @apiDescription Return stock movement history logs with filters.
 * @apiParam {String} [inventoryId] Inventory ID
 * @apiParam {String} [branchId] Branch ID
 * @apiParam {String} [startDate] Start of date range (YYYY-MM-DD)
 * @apiParam {String} [endDate] End of date range (YYYY-MM-DD)
 */
const getMovementHistory = async (req, res, next) => {
    try {
        const { inventoryId, branchId, startDate, endDate } = req.query;
        const filter = {};

        if (inventoryId) {
            // Find inventory first to map product and branch filters
            const inv = await Inventory.findById(inventoryId);
            if (inv) {
                filter.product = inv.product;
                filter.branch = inv.branch;
            } else {
                return res.status(400).json({
                    success: false,
                    error: "Specified inventory record does not exist"
                });
            }
        }

        if (branchId) {
            filter.branch = new mongoose.Types.ObjectId(branchId);
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                // Set end date to final millisecond of that day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const history = await StockMovement.find(filter)
            .populate("product")
            .populate("branch")
            .populate("user", "firstName lastName email role")
            .sort({ createdAt: -1 })
            .exec();

        res.status(200).json({
            success: true,
            count: history.length,
            data: history
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @api {get} /api/inventory/alerts Get low stock alerts
 * @apiDescription Get inventory items where lowStockAlert flag is active.
 * @apiSuccess {Boolean} success Status indicator
 * @apiSuccess {Array} data Low stock inventory array
 */
const getLowStockAlerts = async (req, res, next) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, count: 0, data: [] });
    }
    try {
        const lowStockItems = await Inventory.find({ lowStockAlert: true })
            .populate("product")
            .populate("branch")
            .exec();

        res.status(200).json({
            success: true,
            count: lowStockItems.length,
            data: lowStockItems
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @api {get} /api/inventory/summary Get dashboard inventory summary statistics
 * @apiDescription MongoDB aggregation pipeline computing total inventory stats.
 * @apiSuccess {Boolean} success Status indicator
 * @apiSuccess {Object} data Summary details
 */
const getInventorySummary = async (req, res, next) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, data: { totalStockValue: 0, totalUniqueItems: 0, totalQuantity: 0, lowStockCount: 0 } });
    }
    try {
        const stats = await Inventory.aggregate([
            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productDetail"
                }
            },
            {
                $unwind: "$productDetail"
            },
            {
                $group: {
                    _id: null,
                    totalStockValue: { 
                        $sum: { $multiply: ["$quantity", { $ifNull: ["$productDetail.costPrice", 0] }] } 
                    },
                    totalUniqueProducts: { $addToSet: "$product" },
                    totalPhysicalQuantity: { $sum: "$quantity" },
                    lowStockItemsCount: {
                        $sum: {
                            $cond: [{ $eq: ["$lowStockAlert", true] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalStockValue: 1,
                    totalUniqueItems: { $size: "$totalUniqueProducts" },
                    totalQuantity: "$totalPhysicalQuantity",
                    lowStockCount: "$lowStockItemsCount"
                }
            }
        ]);

        const result = stats[0] || {
            totalStockValue: 0,
            totalUniqueItems: 0,
            totalQuantity: 0,
            lowStockCount: 0
        };

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getInventory,
    getInventoryById,
    updateStock,
    getMovementHistory,
    getLowStockAlerts,
    getInventorySummary
};

/*
================================================================================
SAMPLE REQUEST/RESPONSE DOCUMENTATION
================================================================================

1. PUT /api/inventory/stock (Update Stock)
----------------------------------------
Request Body:
{
    "inventoryId": "648fbc23f9a7213d2f9e4210",
    "quantityChange": -10,
    "type": "sale",
    "reason": "Retail sales transaction",
    "referenceId": "648fcd45f9a7213d2f9e43ef",
    "branchId": "648faa12f9a7213d2f9e419b"
}

Response (200 OK):
{
    "success": true,
    "message": "Stock updated successfully",
    "data": {
        "inventoryId": "648fbc23f9a7213d2f9e4210",
        "productId": "648fb110f9a7213d2f9e41cc",
        "branchId": "648faa12f9a7213d2f9e419b",
        "oldQuantity": 45,
        "newQuantity": 35,
        "lowStockAlert": false,
        "movement": {
            "_id": "648fcd9ef9a7213d2f9e4401",
            "product": "648fb110f9a7213d2f9e41cc",
            "branch": "648faa12f9a7213d2f9e419b",
            "quantityChange": -10,
            "type": "sale",
            "reason": "Retail sales transaction",
            "referenceId": "648fcd45f9a7213d2f9e43ef",
            "user": "648f98eff9a7213d2f9e40aa",
            "createdAt": "2026-06-02T14:50:00.000Z",
            "updatedAt": "2026-06-02T14:50:00.000Z",
            "__v": 0
        }
    }
}

2. GET /api/inventory/summary (Summary Stats)
--------------------------------------------
Response (200 OK):
{
    "success": true,
    "data": {
        "totalStockValue": 154800.50,
        "totalUniqueItems": 142,
        "totalQuantity": 8450,
        "lowStockCount": 12
    }
}
*/
