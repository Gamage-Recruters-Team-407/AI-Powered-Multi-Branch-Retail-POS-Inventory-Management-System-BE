const mongoose = require("mongoose");

const loginSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    userName: {
      type: String,
      trim: true,
    },

    userRole: {
      type: String,
      trim: true,
    },

    ipAddress: {
      type: String,
      trim: true,
    },

    userAgent: {
      type: String,
      trim: true,
    },

    deviceFingerprint: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ⚠️ index: true remove karala thiyenawa
    // TTL index eka pahalin define karanawa
    expiresAt: {
      type: Date,
      required: true,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    revokedAt: {
      type: Date,
    },

    revocationReason: {
      type: String,
      trim: true,
    },

    refreshToken: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * TTL Index
 * expiresAt date eka pass unama MongoDB automatically
 * document eka delete karai.
 */
loginSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports = mongoose.model(
  "LoginSession",
  loginSessionSchema
);