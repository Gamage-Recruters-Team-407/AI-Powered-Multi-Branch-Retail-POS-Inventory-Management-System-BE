const AuditLog = require("../models/AuditLog");

/**
 * Central audit logging service.
 * All modules should use this to record system activities.
 */
const AuditService = {
  /**
   * Log an activity.
   * @param {Object} params
   * @param {Object|null} params.user     - req.user or null for system events
   * @param {string}      params.action   - Action enum value
   * @param {string}      params.module   - Module enum value
   * @param {Object|null} params.req      - Express request object (optional)
   * @param {Object}      [params.options] - Extra fields
   */
  async log({
    user = null,
    action,
    module,
    req = null,
    resourceType = null,
    resourceId = null,
    resourceName = null,
    previousValues = null,
    newValues = null,
    metadata = {},
    severity = "INFO",
    status = "SUCCESS",
    branch = null,
    branchName = null,
    sessionId = null,
  }) {
    try {
      const ipAddress = req
        ? (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "unknown").split(",")[0].trim()
        : "SYSTEM";

      const entry = {
        user: user?._id || user?.id || null,
        userName: user
          ? user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown"
          : "System",
        userRole: user?.role || "SYSTEM",
        userEmail: user?.email || "",
        action,
        module,
        resourceType,
        resourceId,
        resourceName,
        ipAddress,
        userAgent: req?.headers?.["user-agent"] || null,
        method: req?.method || "SYSTEM",
        endpoint: req?.originalUrl || null,
        previousValues,
        newValues,
        metadata,
        severity,
        status,
        branch: branch || user?.branch || null,
        branchName,
        sessionId,
      };

      // Auto-elevate severity based on action
      if (!severity || severity === "INFO") {
        entry.severity = AuditService._inferSeverity(action, status);
      }

      // Auto-flag suspicious events
      if (
        ["SUSPICIOUS_ACTIVITY", "UNAUTHORIZED_ACCESS", "ACCOUNT_LOCKED"].includes(action) ||
        entry.severity === "CRITICAL" ||
        entry.severity === "HIGH"
      ) {
        entry.flagged = true;
        entry.flagReason = `Auto-flagged: ${action}`;
      }

      const log = new AuditLog(entry);
      await log.save();
      return log;
    } catch (err) {
      // Never let audit logging crash the application
      console.error("[AuditService] Failed to write audit log:", err.message);
      return null;
    }
  },

  /**
   * Convenience: log from an Express request.
   * Usage: AuditService.fromReq(req, { action, module, ... })
   */
  async fromReq(req, { action, module, ...rest }) {
    return AuditService.log({ user: req.user, req, action, module, ...rest });
  },

  /**
   * Infer severity based on action type.
   */
  _inferSeverity(action, status) {
    const critical = ["ACCOUNT_LOCKED", "UNAUTHORIZED_ACCESS", "SUSPICIOUS_ACTIVITY", "SECURITY_POLICY_UPDATED", "ROLE_CHANGED"];
    const high = ["LOGIN_FAILED", "USER_DELETED", "BULK_DELETE", "SALE_VOIDED", "PERMISSION_DENIED", "PASSWORD_RESET_COMPLETE", "CONFIG_CHANGED"];
    const medium = ["USER_CREATED", "USER_UPDATED", "PASSWORD_CHANGE", "STOCK_ADJUSTED", "DISCOUNT_APPLIED", "REFUND_PROCESSED", "PURCHASE_ORDER_APPROVED", "STOCK_TRANSFER_APPROVED"];

    if (status === "FAILURE" || status === "BLOCKED") return "HIGH";
    if (critical.includes(action)) return "CRITICAL";
    if (high.includes(action)) return "HIGH";
    if (medium.includes(action)) return "MEDIUM";
    return "INFO";
  },

  /**
   * Get audit summary stats (for dashboard widget).
   */
  async getSummary({ startDate, endDate, branch } = {}) {
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    if (branch) match.branch = branch;

    const [bySeverity, byStatus, byModule, total] = await Promise.all([
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$severity", count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$module", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      AuditLog.countDocuments(match),
    ]);

    return { total, bySeverity, byStatus, byModule };
  },
};

module.exports = AuditService;
