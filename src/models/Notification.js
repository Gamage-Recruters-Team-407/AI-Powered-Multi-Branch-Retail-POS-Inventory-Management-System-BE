const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
{
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    title: String,

    message: String,

    type: {
        type: String,
        enum: ["INFO", "WARNING", "ERROR", "SUCCESS"]
    },

    // H1 Fix: Fields that NotificationService.js writes but were previously missing
    category: {
        type: String,
        enum: ["GENERAL", "INVENTORY", "SYSTEM", "PROMOTION", "CUSTOMER"],
        default: "GENERAL"
    },

    channels: [{
        type: String,
        enum: ["in-app", "email", "sms"]
    }],

    link: {
        type: String
    },

    isRead: {
        type: Boolean,
        default: false
    }
},
{ timestamps: true }
);

// M5 Fix: Database indexes for frequently queried patterns
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);