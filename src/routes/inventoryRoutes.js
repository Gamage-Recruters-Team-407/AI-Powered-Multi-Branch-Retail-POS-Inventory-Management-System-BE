const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const {
    getInventory,
    getInventoryById,
    updateStock,
    getMovementHistory,
    getLowStockAlerts,
    getInventorySummary
} = require("../controllers/inventoryController");

const { protect, authorize } = require("../middleware/authMiddleware");

/**
 * Lightweight, zero-dependency validation middleware for updateStock payload.
 * Ensures the payload has proper shapes, integers, and valid Mongo ObjectIds before hitting controllers.
 */
const validateUpdateStock = (req, res, next) => {
    const { inventoryId, quantityChange, type, reason, branchId } = req.body;
    const errors = [];

    if (!inventoryId || !mongoose.Types.ObjectId.isValid(inventoryId)) {
        errors.push("A valid Mongo ObjectId 'inventoryId' is required.");
    }

    if (quantityChange === undefined || isNaN(Number(quantityChange)) || !Number.isInteger(Number(quantityChange))) {
        errors.push("'quantityChange' must be a valid positive or negative integer.");
    } else if (Number(quantityChange) === 0) {
        errors.push("'quantityChange' cannot be zero.");
    }

    const allowedTypes = ["sale", "purchase", "return", "transfer_out", "transfer_in", "adjustment"];
    if (!type || !allowedTypes.includes(type)) {
        errors.push(`'type' must be one of: ${allowedTypes.join(", ")}`);
    }

    if (!reason || typeof reason !== "string" || reason.trim() === "") {
        errors.push("A textual 'reason' is required for auditing changes.");
    }

    if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
        errors.push("A valid Mongo ObjectId 'branchId' is required.");
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors
        });
    }

    next();
};

// --- ROUTES ---

const readRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "EMPLOYEE"];
const writeRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER"];

// GET /api/inventory - Get list of inventory records with filtering
router.get("/", protect, authorize(...readRoles), getInventory);

// GET /api/inventory/history - Get inventory movement history log
router.get("/history", protect, authorize(...readRoles), getMovementHistory);

// GET /api/inventory/alerts - Fetch low stock alerts (quantity <= reorderPoint)
router.get("/alerts", protect, authorize(...readRoles), getLowStockAlerts);

// GET /api/inventory/summary - Fetch total stock counts, value, low stock sums for dashboard
router.get("/summary", protect, authorize(...readRoles), getInventorySummary);

// GET /api/inventory/:id - Get a single inventory profile detail
router.get("/:id", protect, authorize(...readRoles), getInventoryById);

// PUT /api/inventory/stock - Update stock quantities safely with transactional logs
router.put(
    "/stock",
    protect,
    authorize(...writeRoles),
    validateUpdateStock,
    updateStock
);

module.exports = router;
