// const mongoose = require("mongoose");

// const saleSchema = new mongoose.Schema(
// {
//     invoiceNumber: {
//         type: String,
//         unique: true
//     },

//     customer: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Customer"
//     },

//     cashier: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User"
//     },

//     branch: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Branch"
//     },

//     items: [
//         {
//             product: {
//                 type: mongoose.Schema.Types.ObjectId,
//                 ref: "Product"
//             },

//             quantity: Number,

//             price: Number,

//             discount: Number
//         }
//     ],

//     paymentMethod: {
//         type: String,
//         enum: ["CASH", "CARD", "ONLINE"]
//     },

//     totalAmount: Number,

//     taxAmount: Number,

//     finalAmount: Number
// },
// { timestamps: true }
// );

// module.exports = mongoose.model("Sale", saleSchema);

const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: { type: String, required: true },
  barcode: String,
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },   
  lineTotal: { type: Number, required: true }, 
});

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      default: null,
    },

    items: [saleItemSchema],

    subtotal: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },         
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "QR"],
      required: true,
    },

    cashReceived: Number,
    changeGiven: Number,

    status: {
      type: String,
      enum: ["COMPLETED", "VOIDED", "REFUNDED"],
      default: "COMPLETED",
    },

    receiptSentTo: String, // email if digital receipt was sent
  },
  { timestamps: true }
);

// Auto-generate invoice number before saving
saleSchema.pre("save", async function (next) {
  if (!this.invoiceNumber) {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    const count = await mongoose.model("Sale").countDocuments();
    this.invoiceNumber = `INV-${dateStr}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Sale", saleSchema);