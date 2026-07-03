const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema(
{
    title: String,

    description: String,

    discountType: {
        type: String,
        enum: ["PERCENTAGE", "FIXED"]
    },

    discountValue: Number,

    startDate: Date,

    endDate: Date,

    applicableProducts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product"
        }
    ],

    couponCode: {
        type: String,
        unique: true,
        uppercase: true,
        trim: true
    },

    minPurchaseAmount: {
        type: Number,
        default: 0
    },

    usageLimit: {
        type: Number,
        default: null
    },

    usageCount: {
        type: Number,
        default: 0
    },

    branches: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch"
        }
    ],

    isActive: {
        type: Boolean,
        default: true
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("Promotion", promotionSchema);