const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true
    },

    barcode: {
        type: String,
        unique: true
    },

    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
    },

    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier"
    },

    brand: String,

    description: String,

    price: Number,

    costPrice: Number,

    image: String,

    imagePublicId: String,

    reorderLevel: Number,

    unit: String,

    isActive: {
        type: Boolean,
        default: true
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);