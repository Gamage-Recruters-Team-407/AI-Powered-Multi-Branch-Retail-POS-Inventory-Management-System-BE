const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
{
    firstName: String,
    lastName: String,

    email: {
        type: String,
        unique: true
    },

    phone: {
        type: String,
        unique: true
    },

    gender: {
        type: String,
        enum: ["MALE", "FEMALE", "OTHER"]
    },

    customerType: {
        type: String,
        enum: ["BRONZE", "SILVER", "GOLD", "PLATINUM"],
        default: "BRONZE"
    },

    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE"
    },

    loyaltyPoints: {
        type: Number,
        default: 0
    },

    totalPurchases: {
        type: Number,
        default: 0
    },

    preferredBranch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch"
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);