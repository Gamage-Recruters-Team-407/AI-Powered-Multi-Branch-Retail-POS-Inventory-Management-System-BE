const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
{
    id: {
        type: String,
        required: true,
        unique: true
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
    paymentMethod: {
        type: String,
        required: true
    },
    items: [
        {
            id: String,
            name: String,
            qty: Number,
            price: Number,
            returnedQty: {
                type: Number,
                default: 0
            }
        }
    ],
    taxRate: {
        type: Number,
        required: true
    },
    discountAmount: {
        type: Number,
        required: true
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
