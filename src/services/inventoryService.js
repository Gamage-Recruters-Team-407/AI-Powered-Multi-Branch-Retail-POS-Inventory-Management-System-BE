const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");

/**
 * Calculates the new stock level and ensures it does not fall below zero
 * @param {number} currentStock - The current stock quantity
 * @param {number} quantityChange - The change in stock (positive or negative)
 * @returns {number} The calculated new stock level
 * @throws {Error} If the resulting quantity is negative
 */
const calculateStockAfterMovement = (currentStock, quantityChange) => {
    const newQuantity = currentStock + quantityChange;
    if (newQuantity < 0) {
        throw new Error("Insufficient stock. Inventory quantity cannot be negative.");
    }
    return newQuantity;
};

/**
 * Validates if the new stock quantity is at or below the reorder level
 * @param {number} currentQuantity - The current quantity
 * @param {number} reorderLevel - The threshold for low stock alert
 * @returns {boolean} True if stock is low, false otherwise
 */
const validateReorderPoint = (currentQuantity, reorderLevel) => {
    if (typeof reorderLevel !== "number") return false;
    return currentQuantity <= reorderLevel;
};

/**
 * Core service function to update inventory stock with transaction safety
 * @param {Object} params - Parameter object
 * @param {string} params.inventoryId - Inventory document ID
 * @param {number} params.quantityChange - Amount to add/subtract
 * @param {string} params.type - Movement type (sale, purchase, return, etc.)
 * @param {string} params.reason - Reason description
 * @param {string} [params.referenceId] - Optional associated transaction ID
 * @param {string} params.userId - User ID who triggered the action
 * @param {ClientSession} [session] - Optional Mongoose session for transactions
 * @returns {Object} Update summary containing old and new quantities and low stock status
 */
const updateInventoryStock = async (
    { inventoryId, quantityChange, type, reason, referenceId, userId },
    session = null
) => {
    // 1. Fetch Inventory inside the session if provided
    const query = Inventory.findById(inventoryId);
    if (session) {
        query.session(session);
    }
    const inventory = await query;

    if (!inventory) {
        throw new Error("Inventory record not found.");
    }

    // 2. Fetch Product to get the reorder Level and verify details
    const productQuery = Product.findById(inventory.product);
    if (session) {
        productQuery.session(session);
    }
    const product = await productQuery;

    if (!product) {
        throw new Error("Product associated with this inventory record not found.");
    }

    const oldQuantity = inventory.quantity;
    
    // 3. Compute and validate the new quantity
    const newQuantity = calculateStockAfterMovement(oldQuantity, quantityChange);

    // 4. Update the inventory quantity and low‑stock flag
    inventory.quantity = newQuantity;
    
    const isLowStock = validateReorderPoint(newQuantity, product.reorderLevel);
    inventory.lowStockAlert = isLowStock;

    if (session) {
        await inventory.save({ session });
    } else {
        await inventory.save();
    }

    // 5. Create the StockMovement record
    const movementData = {
        product: inventory.product,
        branch: inventory.branch,
        quantityChange: quantityChange,
        type: type,
        reason: reason,
        referenceId: referenceId ? new mongoose.Types.ObjectId(referenceId) : undefined,
        user: new mongoose.Types.ObjectId(userId)
    };

    let movement;
    if (session) {
        const movements = await StockMovement.create([movementData], { session });
        movement = movements[0];
    } else {
        movement = await StockMovement.create(movementData);
    }

    return {
        inventoryId: inventory._id,
        productId: inventory.product,
        branchId: inventory.branch,
        oldQuantity,
        newQuantity,
        lowStockAlert: isLowStock,
        movementType: type,
        movement
    };
};

module.exports = {
    calculateStockAfterMovement,
    validateReorderPoint,
    updateInventoryStock
};
