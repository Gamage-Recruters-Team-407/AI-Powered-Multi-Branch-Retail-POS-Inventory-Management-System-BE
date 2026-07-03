const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
{
    name: String,

    code: {
        type: String,
        unique: true
    },

    address: String,

    city: String,

    contactNumber: String,

    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    settings: {
        type: Object,
        default: {}
    },

    isActive: {
        type: Boolean,
        default: true
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("Branch", branchSchema);