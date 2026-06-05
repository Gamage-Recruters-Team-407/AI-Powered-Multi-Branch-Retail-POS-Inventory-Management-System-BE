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
