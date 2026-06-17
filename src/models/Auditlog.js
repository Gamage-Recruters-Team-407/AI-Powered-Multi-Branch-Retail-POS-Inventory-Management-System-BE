const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    // Actor
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userName: { type: String, default: "System" },
    userRole: { type: String, default: "SYSTEM" },
    userEmail: { type: String, default: "" },

    // Action details
    action: {
      type: String,
      required: true,
      enum: [
        // Auth
        "LOGIN",
        "LOGOUT",
        "LOGIN_FAILED",
        "PASSWORD_CHANGE",
        "PASSWORD_RESET_REQUEST",
        "PASSWORD_RESET_COMPLETE",
        "TOKEN_REFRESH",
        "ACCOUNT_LOCKED",
        "ACCOUNT_UNLOCKED",
        // User management
        "USER_CREATED",
        "USER_UPDATED",
        "USER_DELETED",
        "USER_ACTIVATED",
        "USER_DEACTIVATED",
        "ROLE_CHANGED",
        // Data operations
        "CREATE",
        "READ",
        "UPDATE",
        "DELETE",
        "EXPORT",
        "IMPORT",
        "BULK_DELETE",
        "BULK_UPDATE",
        // Sales / POS
        "SALE_COMPLETED",
        "SALE_VOIDED",
        "REFUND_PROCESSED",
        "DISCOUNT_APPLIED",
        "PAYMENT_RECEIVED",
        // Inventory
        "STOCK_ADJUSTED",
        "STOCK_TRANSFER_INITIATED",
        "STOCK_TRANSFER_APPROVED",
        "STOCK_TRANSFER_REJECTED",
        "PURCHASE_ORDER_CREATED",
        "PURCHASE_ORDER_APPROVED",
        // Security events
        "SUSPICIOUS_ACTIVITY",
        "UNAUTHORIZED_ACCESS",
        "RATE_LIMIT_EXCEEDED",
        "PERMISSION_DENIED",
        "CONFIG_CHANGED",
        "SECURITY_POLICY_UPDATED",
        // Reports
        "REPORT_GENERATED",
        "REPORT_EXPORTED",
        "REPORT_SCHEDULED",
        // System
        "SYSTEM_STARTUP",
        "SYSTEM_SHUTDOWN",
        "BACKUP_CREATED",
        "SETTINGS_CHANGED",
      ],
    },

    module: {
      type: String,
      required: true,
      enum: [
        "AUTH",
        "USER_MANAGEMENT",
        "PRODUCT",
        "INVENTORY",
        "SALES",
        "PURCHASE_ORDER",
        "STOCK_TRANSFER",
        "SUPPLIER",
        "CUSTOMER",
        "EMPLOYEE",
        "BRANCH",
        "WAREHOUSE",
        "REPORT",
        "NOTIFICATION",
        "PROMOTION",
        "DASHBOARD",
        "CATEGORY",
        "AUDIT",
        "SECURITY",
        "SYSTEM",
        "RETURN",
      ],
    },

    // Target resource
    resourceType: { type: String, default: null }, // e.g. "Product", "Sale"
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    resourceName: { type: String, default: null },

    // Request context
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    method: { type: String, enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "SYSTEM"], default: "SYSTEM" },
    endpoint: { type: String, default: null },

    // Before/after for mutations
    previousValues: { type: mongoose.Schema.Types.Mixed, default: null },
    newValues: { type: mongoose.Schema.Types.Mixed, default: null },

    // Additional metadata
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Risk classification
    severity: {
      type: String,
      enum: ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "INFO",
    },

    // Status of the action
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE", "BLOCKED"],
      default: "SUCCESS",
    },

    // Branch context
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    branchName: { type: String, default: null },

    // Flagging for review
    flagged: { type: Boolean, default: false },
    flagReason: { type: String, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },

    // Session tracking
    sessionId: { type: String, default: null },
  },
  {
    timestamps: true,
    // TTL index: auto-delete logs older than 2 years (configurable)
    // Set in model index below
  }
);

// Indexes for fast querying
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ status: 1 });
auditLogSchema.index({ flagged: 1 });
auditLogSchema.index({ ipAddress: 1 });
auditLogSchema.index({ branch: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);