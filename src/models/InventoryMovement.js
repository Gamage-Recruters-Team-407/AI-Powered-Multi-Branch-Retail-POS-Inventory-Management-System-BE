const mongoose = require("mongoose");

const inventoryMovementSchema = new mongoose.Schema(
    {
        transfer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StockTransfer",
            required: true
        },

        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true
        },

        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        movementType: {
            type: String,
            enum: ["OUT", "IN", "RESTORE"],
            required: true
        },

        quantity: {
            type: Number,
            required: true
        },

        previousQuantity: Number,
        newQuantity: Number,

        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        note: String
    },
    { timestamps: true }
);

module.exports = mongoose.model("InventoryMovement", inventoryMovementSchema);
