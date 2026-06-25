const mongoose = require("mongoose");

const returnSchema = new mongoose.Schema(
{
    id: {
        type: String,
        required: true,
        unique: true
    },
    invoiceId: {
        type: String,
        required: true
    },
    customer: {
        type: String,
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    subtotal: {
        type: Number,
        default: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    paymentMethod: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["Refunded", "Pending Approval", "Rejected"],
        default: "Pending Approval"
    },
    approvalRequired: {
        type: Boolean,
        default: false
    },
    reason: {
        type: String,
        required: true
    },
    condition: {
        type: String,
        required: true
    },
    items: [
        {
            id: String,
            name: String,
            qty: Number,
            price: Number
        }
    ]
},
{ timestamps: true }
);

module.exports = mongoose.model("Return", returnSchema);
