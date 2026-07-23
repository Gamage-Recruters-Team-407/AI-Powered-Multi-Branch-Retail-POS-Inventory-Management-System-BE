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

    // ── Main Warehouse Flag ─────────────────────────────────────
    // System ekke "main" (headquarters) warehouse eka mark karanawaa
    // Eka velayaka warehouse ekkai main warehouse widihata mark wenna puluwan
    isMain:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Warehouse", warehouseSchema);