const AuditLog = require("../models/AuditLog");
const SecurityPolicy = require("../models/SecurityPolicy");
const LoginAttempt = require("../models/LoginAttempt");
const AuditService = require("../services/auditService");
const SecurityService = require("../services/securityService");

// ─── Audit Log Endpoints ────────────────────────────────────────────────────

/**
 * GET /api/audit/logs
 * Query audit logs with filters, pagination, and search.
 */
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      user,
      action,
      module,
      severity,
      status,
      branch,
      startDate,
      endDate,
      ipAddress,
      flagged,
      resourceType,
      search,
    } = req.query;

    const filter = {};

    if (user) filter.user = user;
    if (action) filter.action = action;
    if (module) filter.module = module;
    if (severity) filter.severity = severity;
    if (status) filter.status = status;
    if (branch) filter.branch = branch;
    if (ipAddress) filter.ipAddress = ipAddress;
    if (resourceType) filter.resourceType = resourceType;
    if (flagged !== undefined) filter.flagged = flagged === "true";

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { resourceName: { $regex: search, $options: "i" } },
        { endpoint: { $regex: search, $options: "i" } },
        { ipAddress: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("user", "name email role")
        .populate("branch", "name")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/logs/:id
 */
const getAuditLogById = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate("user", "name email role")
      .populate("branch", "name")
      .populate("reviewedBy", "name email")
      .lean();

    if (!log) return res.status(404).json({ success: false, message: "Audit log not found" });

    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/logs/user/:userId
 * Get all audit logs for a specific user.
 */
const getUserAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    const filter = { user: req.params.userId };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/summary
 * Dashboard summary stats.
 */
const getAuditSummary = async (req, res) => {
  try {
    const { startDate, endDate, branch } = req.query;
    const summary = await AuditService.getSummary({ startDate, endDate, branch });
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/flagged
 * Get flagged / suspicious events.
 */
const getFlaggedEvents = async (req, res) => {
  try {
    const { page = 1, limit = 50, reviewed } = req.query;
    const filter = { flagged: true };
    if (reviewed === "true") filter.reviewedBy = { $ne: null };
    if (reviewed === "false") filter.reviewedBy = null;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("user", "name email role")
        .populate("reviewedBy", "name email")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/audit/logs/:id/flag
 * Manually flag or unflag an event.
 */
const flagAuditLog = async (req, res) => {
  try {
    const { flagged, flagReason } = req.body;
    const log = await AuditLog.findByIdAndUpdate(
      req.params.id,
      { flagged, flagReason: flagged ? flagReason : null },
      { returnDocument: 'after' }
    );
    if (!log) return res.status(404).json({ success: false, message: "Log not found" });

    await AuditService.fromReq(req, {
      action: "UPDATE",
      module: "AUDIT",
      resourceType: "AuditLog",
      resourceId: log._id,
      metadata: { flagged, flagReason },
    });

    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/audit/logs/:id/review
 * Mark a flagged event as reviewed.
 */
const reviewAuditLog = async (req, res) => {
  try {
    const { notes } = req.body;
    const log = await AuditLog.findByIdAndUpdate(
      req.params.id,
      { reviewedBy: req.user._id, reviewedAt: new Date(), reviewNotes: notes },
      { returnDocument: 'after' }
    ).populate("reviewedBy", "name email");

    if (!log) return res.status(404).json({ success: false, message: "Log not found" });

    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/activity-timeline
 * Hourly activity over the last 24h for dashboard charts.
 */
const getActivityTimeline = async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const timeline = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
            hour: { $hour: "$createdAt" },
          },
          count: { $sum: 1 },
          failures: { $sum: { $cond: [{ $eq: ["$status", "FAILURE"] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ["$severity", "CRITICAL"] }, 1, 0] } },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 } },
    ]);

    res.json({ success: true, data: timeline });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Security Policy Endpoints ──────────────────────────────────────────────

/**
 * GET /api/audit/security-policy
 */
const getSecurityPolicy = async (req, res) => {
  try {
    const policy = await SecurityService.getActivePolicy();
    res.json({ success: true, data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/audit/security-policy
 */
const updateSecurityPolicy = async (req, res) => {
  try {
    const policy = await SecurityService.updatePolicy(req.body, req.user);
    res.json({ success: true, message: "Security policy updated.", data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/audit/security-policy/blacklist
 * Add IP to blacklist.
 */
const blacklistIP = async (req, res) => {
  try {
    const { ipAddress } = req.body;
    if (!ipAddress) return res.status(400).json({ success: false, message: "ipAddress is required." });

    const policy = await SecurityService.addToBlacklist(ipAddress, req.user);
    res.json({ success: true, message: `IP ${ipAddress} blacklisted.`, data: policy.ipPolicy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/audit/security-policy/blacklist/:ip
 * Remove IP from blacklist.
 */
const removeBlacklistIP = async (req, res) => {
  try {
    const ipAddress = decodeURIComponent(req.params.ip);
    const policy = await SecurityService.removeFromBlacklist(ipAddress, req.user);
    res.json({ success: true, message: `IP ${ipAddress} removed from blacklist.`, data: policy.ipPolicy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Security Monitoring ────────────────────────────────────────────────────

/**
 * GET /api/audit/login-attempts
 */
const getLoginAttempts = async (req, res) => {
  try {
    const { email, ipAddress, success, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (email) filter.email = { $regex: email, $options: "i" };
    if (ipAddress) filter.ipAddress = ipAddress;
    if (success !== undefined) filter.success = success === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [attempts, total] = await Promise.all([
      LoginAttempt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      LoginAttempt.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: attempts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/suspicious-activity
 * Run the suspicious activity detection scan.
 */
const detectSuspiciousActivity = async (req, res) => {
  try {
    const flags = await SecurityService.detectSuspiciousActivity();
    res.json({ success: true, data: flags, count: flags.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Compliance Report ───────────────────────────────────────────────────────

/**
 * GET /api/audit/compliance-report
 * Generate a compliance report for a time period.
 */
const getComplianceReport = async (req, res) => {
  try {
    const { startDate, endDate, branch } = req.query;
    const report = await SecurityService.generateComplianceReport({ startDate, endDate, branch });

    await AuditService.fromReq(req, {
      action: "REPORT_GENERATED",
      module: "AUDIT",
      metadata: { reportType: "COMPLIANCE", startDate, endDate },
    });

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/export
 * Export audit logs as JSON (extend with CSV/PDF as needed).
 */
const exportAuditLogs = async (req, res) => {
  try {
    const { startDate, endDate, module, severity, format = "json" } = req.query;
    const filter = {};
    if (module) filter.module = module;
    if (severity) filter.severity = severity;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();

    await AuditService.fromReq(req, {
      action: "REPORT_EXPORTED",
      module: "AUDIT",
      metadata: { count: logs.length, format, startDate, endDate },
    });

    if (format === "csv") {
      const fields = ["createdAt", "userName", "userEmail", "userRole", "action", "module", "severity", "status", "ipAddress", "endpoint", "resourceType", "resourceName"];
      const header = fields.join(",");
      const rows = logs.map((l) =>
        fields.map((f) => {
          const v = l[f];
          return v != null ? `"${String(v).replace(/"/g, '""')}"` : "";
        }).join(",")
      );
      const csv = [header, ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.csv"`);
      return res.send(csv);
    }

    res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.json"`);
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit/validate-password
 * Check a password against the current policy.
 */
const validatePassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: "password is required." });
    const result = await SecurityService.validatePassword(password);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
  getUserAuditLogs,
  getAuditSummary,
  getFlaggedEvents,
  flagAuditLog,
  reviewAuditLog,
  getActivityTimeline,
  getSecurityPolicy,
  updateSecurityPolicy,
  blacklistIP,
  removeBlacklistIP,
  getLoginAttempts,
  detectSuspiciousActivity,
  getComplianceReport,
  exportAuditLogs,
  validatePassword,
};
