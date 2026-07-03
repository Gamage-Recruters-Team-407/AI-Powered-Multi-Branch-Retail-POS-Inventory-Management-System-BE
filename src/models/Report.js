const mongoose = require("mongoose");

/**
 * Report — database-driven report history.
 * A new document is written every time an admin generates or exports a report.
 */
const reportSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },

        // Action label shown in the history panel
        action: {
            type: String,
        },

        // Who generated the report (populated from User)
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        // Report category: Sales | Inventory | Branch Performance | Business Summary
        type: {
            type: String,
            default: "Sales",
        },

        // Export format badge: PDF | Excel | View | Scheduled
        format: {
            type: String,
            enum: ["PDF", "Excel", "View", "Scheduled"],
            default: "View",
        },

        // Optional file URL if stored to disk/cloud
        fileUrl: {
            type: String,
        },

        // Filters applied at generation time (for audit trail)
        filters: {
            branch: String,
            status: String,
            fromDate: Date,
            toDate: Date,
            invoiceNumber: String,
        },

        generatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);