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
    status: {
        type: String,
        enum: ["Refunded", "Pending Approval", "Rejected"],
        default: "Pending Approval"
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
