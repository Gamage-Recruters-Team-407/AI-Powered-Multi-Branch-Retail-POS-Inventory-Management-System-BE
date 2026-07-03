const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    location: { type: String, required: true },
    address:  { type: String },
    phone:    { type: String },
    manager:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    capacity: { type: Number, required: true }, // total capacity units
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Warehouse", warehouseSchema);
