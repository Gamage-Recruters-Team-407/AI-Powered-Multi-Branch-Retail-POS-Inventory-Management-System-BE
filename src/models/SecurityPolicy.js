const mongoose = require("mongoose");

const securityPolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g. "default", "strict"
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },

    // Password policy
    passwordPolicy: {
      minLength: { type: Number, default: 8 },
      requireUppercase: { type: Boolean, default: true },
      requireLowercase: { type: Boolean, default: true },
      requireNumbers: { type: Boolean, default: true },
      requireSpecialChars: { type: Boolean, default: false },
      maxAge: { type: Number, default: 90 }, // days before forced change
      historyCount: { type: Number, default: 5 }, // remember last N passwords
    },

    // Session / token policy
    sessionPolicy: {
      jwtExpiresIn: { type: String, default: "24h" },
      maxConcurrentSessions: { type: Number, default: 3 },
      inactivityTimeoutMinutes: { type: Number, default: 60 },
    },

    // Account lockout
    lockoutPolicy: {
      enabled: { type: Boolean, default: true },
      maxAttempts: { type: Number, default: 5 },
      lockoutDurationMinutes: { type: Number, default: 30 },
      resetAfterMinutes: { type: Number, default: 60 },
    },

    // Rate limiting
    rateLimitPolicy: {
      windowMs: { type: Number, default: 15 * 60 * 1000 }, // 15 minutes
      maxRequests: { type: Number, default: 100 },
      authMaxRequests: { type: Number, default: 10 }, // auth endpoints
    },

    // Audit policy
    auditPolicy: {
      logReadOperations: { type: Boolean, default: false },
      logSuccessfulLogins: { type: Boolean, default: true },
      retentionDays: { type: Number, default: 730 }, // 2 years
      autoFlagSuspiciousIPs: { type: Boolean, default: true },
      maxFailedLoginsBeforeFlag: { type: Number, default: 10 },
    },

    // IP policy
    ipPolicy: {
      enableWhitelist: { type: Boolean, default: false },
      whitelist: [{ type: String }],
      enableBlacklist: { type: Boolean, default: true },
      blacklist: [{ type: String }],
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SecurityPolicy", securityPolicySchema);
