const mongoose = require("mongoose");

// Every stock IN / OUT / TRANSFER gets recorded here
const warehouseTransactionSchema = new mongoose.Schema(
  {
    warehouse:   { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    zone:        { type: mongoose.Schema.Types.ObjectId, ref: "WarehouseZone" },
    product:     { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    type:        { type: String, enum: ["IN", "OUT", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT"], required: true },
    quantity:    { type: Number, required: true },
    reference:   { type: String },   // e.g. Purchase Order ID, Transfer ID
    fromBranch:  { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    toBranch:    { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note:        { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WarehouseTransaction", warehouseTransactionSchema);
