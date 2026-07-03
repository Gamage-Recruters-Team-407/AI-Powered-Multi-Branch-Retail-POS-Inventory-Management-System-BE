const mongoose = require("mongoose");

const loginSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userEmail: { type: String, required: true },
    userName: { type: String },
    userRole: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    deviceFingerprint: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    lastActivityAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
    revocationReason: { type: String },
    refreshToken: { type: String },
  },
  { timestamps: true }
);

// Auto-expire sessions (TTL index)
loginSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("LoginSession", loginSessionSchema);