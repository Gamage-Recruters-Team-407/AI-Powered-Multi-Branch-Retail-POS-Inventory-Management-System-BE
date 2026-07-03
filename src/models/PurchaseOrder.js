const mongoose = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    supplierName: {
      type: String,
      trim: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    branch: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    orderDate: {
      type: Date,
    },
    expectedDate: {
      type: Date,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: Number,
        costPrice: Number,
      },
    ],
    itemCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    priority: {
      type: String,
      enum: ["Low", "Normal", "Medium", "High"],
      default: "Normal",
    },
    category: {
      type: String,
      trim: true,
      default: "Mixed Stock",
    },
    owner: {
      type: String,
      trim: true,
      default: "Procurement Team",
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Received",
        "PENDING",
        "APPROVED",
        "RECEIVED",
        "CANCELLED",
      ],
      default: "Pending",
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
