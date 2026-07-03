const mongoose = require("mongoose");

// Tracks exactly which product is in which zone & how many
const warehouseStockSchema = new mongoose.Schema(
  {
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    zone:      { type: mongoose.Schema.Types.ObjectId, ref: "WarehouseZone", required: true },
    product:   { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity:  { type: Number, required: true, default: 0 },
    minStock:  { type: Number, default: 10 },  // low stock alert threshold
    batchNo:   { type: String },
    expiryDate:{ type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WarehouseStock", warehouseStockSchema);
