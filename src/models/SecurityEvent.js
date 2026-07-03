const mongoose = require("mongoose");

const securityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "BRUTE_FORCE",
        "SUSPICIOUS_IP",
        "PRIVILEGE_ESCALATION",
        "DATA_EXFILTRATION",
        "UNAUTHORIZED_ACCESS",
        "MULTIPLE_FAILURES",
        "SESSION_HIJACK",
        "CONFIG_CHANGE",
      ],
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },
    description: { type: String, required: true },
    ipAddress: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    module: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolutionNotes: { type: String },
  },
  { timestamps: true }
);

securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ type: 1, resolved: 1 });
securityEventSchema.index({ severity: 1 });

module.exports = mongoose.model("SecurityEvent", securityEventSchema);