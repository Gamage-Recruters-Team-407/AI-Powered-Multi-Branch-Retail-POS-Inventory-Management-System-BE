const mongoose = require("mongoose");

const loginAttemptSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
    success: { type: Boolean, required: true },
    failureReason: { type: String, default: null }, // "INVALID_PASSWORD", "ACCOUNT_DISABLED", etc.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Auto-expire login attempt records after 24 hours
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
loginAttemptSchema.index({ email: 1, createdAt: -1 });
loginAttemptSchema.index({ ipAddress: 1, createdAt: -1 });

module.exports = mongoose.model("LoginAttempt", loginAttemptSchema);
