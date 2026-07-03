const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
{
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },

    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        required: true
    },

    quantityChange: {
        type: Number,
        required: true
    },

    type: {
        type: String,
        enum: ["sale", "purchase", "return", "transfer_out", "transfer_in", "adjustment"],
        required: true
    },

    reason: {
        type: String,
        required: true
    },

    referenceId: {
        type: mongoose.Schema.Types.ObjectId
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("StockMovement", stockMovementSchema);
