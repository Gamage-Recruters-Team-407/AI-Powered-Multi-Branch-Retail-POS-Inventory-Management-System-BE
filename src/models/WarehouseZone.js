const mongoose = require("mongoose");

// Warehouse Zone = racks / shelves / areas inside a warehouse
const warehouseZoneSchema = new mongoose.Schema(
  {
    warehouse:    { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    zoneName:     { type: String, required: true },   // e.g. "Zone A", "Rack 3", "Cold Storage"
    zoneCode:     { type: String, required: true },   // e.g. "A", "B", "COLD"
    capacity:     { type: Number, required: true },   // max units this zone can hold
    currentStock: { type: Number, default: 0 },       // current units stored
    description:  { type: String },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Virtual: usage percentage
warehouseZoneSchema.virtual("usagePercent").get(function () {
  return ((this.currentStock / this.capacity) * 100).toFixed(1);
});

module.exports = mongoose.model("WarehouseZone", warehouseZoneSchema);
