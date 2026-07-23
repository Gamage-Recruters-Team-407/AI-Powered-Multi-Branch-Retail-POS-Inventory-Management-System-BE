const mongoose = require("mongoose");

const SecurityPolicySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: "default",
  },
  description: {
    type: String,
    default: "System default security policy",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  
  ipPolicy: {
    enableBlacklist: {
      type: Boolean,
      default: true,
    },
    blacklist: {
      type: [String],
      default: [],
    },
    enableWhitelist: {
      type: Boolean,
      default: false,
    },
    whitelist: {
      type: [String],
      default: [],
    },
  },
  
  passwordPolicy: {
    minLength: {
      type: Number,
      default: 8,
    },
    requireUppercase: {
      type: Boolean,
      default: true,
    },
    requireLowercase: {
      type: Boolean,
      default: true,
    },
    requireNumbers: {
      type: Boolean,
      default: true,
    },
    requireSpecialChars: {
      type: Boolean,
      default: true,
    },
    preventReuse: {
      type: Number,
      default: 5,
    },
    expireAfterDays: {
      type: Number,
      default: 90,
    },
  },
  
  // ✅ Lockout Policy - 20 failed attempts
  lockoutPolicy: {
    enabled: {
      type: Boolean,
      default: true,
    },
    maxAttempts: {
      type: Number,
      default: 20, // ✅ 20 failed attempts
    },
    lockoutDurationMinutes: {
      type: Number,
      default: 30,
    },
    resetAfterMinutes: {
      type: Number,
      default: 15,
    },
  },
  
  auditPolicy: {
    retentionDays: {
      type: Number,
      default: 730,
    },
    logLevel: {
      type: String,
      enum: ["INFO", "WARN", "ERROR"],
      default: "INFO",
    },
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("SecurityPolicy", SecurityPolicySchema);