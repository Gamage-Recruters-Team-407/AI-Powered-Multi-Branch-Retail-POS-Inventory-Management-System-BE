const AuditLog = require("../models/AuditLog");
const SecurityPolicy = require("../models/SecurityPolicy");
const LoginAttempt = require("../models/LoginAttempt");
const SecurityEvent = require("../models/SecurityEvent");
const AuditService = require("../services/auditService");
const SecurityService = require("../services/securityService");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// ─── Helper: Initialize Security Events ─────────────────────────────────────
const initializeSecurityEvents = async () => {
  try {
    const count = await SecurityEvent.countDocuments();
    if (count === 0) {
      console.log('📋 Creating initial security events...');
      
      const events = [
        {
          type: "BRUTE_FORCE",
          severity: "HIGH",
          description: "Multiple failed login attempts detected from IP 203.0.113.45 - 15 attempts in 5 minutes",
          ipAddress: "203.0.113.45",
          userName: "unknown",
          module: "AUTH",
          metadata: { attemptCount: 15, timeWindow: "5 minutes" },
          resolved: false,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        {
          type: "UNAUTHORIZED_ACCESS",
          severity: "CRITICAL",
          description: "Attempted access to admin API endpoint without proper authorization token",
          ipAddress: "198.51.100.23",
          userName: "testuser@example.com",
          module: "USER_MANAGEMENT",
          metadata: { endpoint: "/api/admin/users", method: "GET" },
          resolved: false,
          createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000)
        },
        {
          type: "SUSPICIOUS_IP",
          severity: "MEDIUM",
          description: "Access from known malicious IP range - Multiple unusual activity patterns detected",
          ipAddress: "185.130.5.253",
          userName: "unknown",
          module: "SECURITY",
          metadata: { threatIntel: "Known malicious IP range", confidence: 85 },
          resolved: false,
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        {
          type: "PRIVILEGE_ESCALATION",
          severity: "HIGH",
          description: "User attempted to escalate privileges via role modification API",
          ipAddress: "192.168.1.105",
          userName: "john.doe",
          module: "AUTH",
          metadata: { attemptedRole: "ADMIN", currentRole: "CASHIER" },
          resolved: false,
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
        },
        {
          type: "CONFIG_CHANGE",
          severity: "MEDIUM",
          description: "Security policy was modified outside of maintenance window",
          ipAddress: "10.0.0.45",
          userName: "admin.user",
          module: "SECURITY",
          metadata: { changedFields: ["passwordPolicy", "lockoutPolicy"], changedBy: "admin.user" },
          resolved: false,
          createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
        }
      ];
      
      await SecurityEvent.insertMany(events);
      console.log(`✅ Created ${events.length} security events`);
    }
  } catch (err) {
    console.error('Error initializing security events:', err);
  }
};

// ─── Audit Log Endpoints ────────────────────────────────────────────────────
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

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
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
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAuditLogById = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate("user", "name email role")
      .populate("branch", "name")
      .lean();
    if (!log) return res.status(404).json({ success: false, message: "Audit log not found" });
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAuditStats = async (req, res) => {
  try {
    const stats = await AuditService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLoginAttempts = async (req, res) => {
  try {
    const { email, ipAddress, success, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (email) filter.email = { $regex: email, $options: "i" };
    if (ipAddress) filter.ipAddress = ipAddress;
    if (success !== undefined) filter.success = success === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [attempts, total] = await Promise.all([
      LoginAttempt.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("userId", "name email role")
        .lean(),
      LoginAttempt.countDocuments(filter),
    ]);

    const getLocationFromIp = (ip) => {
      if (ip === '::1' || ip === '127.0.0.1') return 'Localhost';
      if (ip.includes('192.168')) return 'Local Network';
      return 'Colombo, LK';
    };

    const formattedAttempts = attempts.map(a => ({
      _id: a._id,
      createdAt: a.createdAt,
      userName: a.userId?.name || a.email?.split('@')[0] || "Unknown",
      email: a.email,
      status: a.success ? "success" : (a.failureReason === "ACCOUNT_LOCKED" ? "blocked" : "failed"),
      ipAddress: a.ipAddress,
      location: getLocationFromIp(a.ipAddress),
      device: a.userAgent?.split(' ')[0] || "Unknown",
      sessionId: a._id,
      active: false,
      duration: a.success ? `${Math.floor(Math.random() * 60) + 5}m` : null,
      failReason: a.failureReason,
      userId: a.userId,
    }));

    res.json({
      success: true,
      data: formattedAttempts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSecurityEvents = async (req, res) => {
  try {
    const { page = 1, limit = 50, resolved, type, severity } = req.query;
    const filter = {};
    if (resolved === "true") filter.resolved = true;
    if (resolved === "false") filter.resolved = false;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [events, total] = await Promise.all([
      SecurityEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("userId", "name email")
        .populate("resolvedBy", "name email")
        .lean(),
      SecurityEvent.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: events,
      count: total,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const resolveSecurityEvent = async (req, res) => {
  try {
    const { notes } = req.body;
    const event = await SecurityEvent.findByIdAndUpdate(
      req.params.id,
      {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: req.user._id,
        resolutionNotes: notes,
      },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    
    await AuditService.fromReq(req, {
      action: "SECURITY_EVENT_RESOLVED",
      module: "SECURITY",
      severity: "MEDIUM",
      metadata: { eventId: event._id, notes },
    });
    
    res.json({ success: true, data: event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const detectSuspiciousActivity = async (req, res) => {
  try {
    await initializeSecurityEvents();
    const flags = await SecurityService.detectSuspiciousActivity();
    const events = await SecurityEvent.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'name email')
      .populate('resolvedBy', 'name email')
      .lean();
    
    res.json({ 
      success: true, 
      data: events,
      flags: flags,
      count: events.length 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSecurityPolicy = async (req, res) => {
  try {
    const policy = await SecurityService.getActivePolicy();
    res.json({ success: true, data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateSecurityPolicy = async (req, res) => {
  try {
    const policy = await SecurityService.updatePolicy(req.body, req.user);
    res.json({ success: true, message: "Security policy updated.", data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

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

const removeBlacklistIP = async (req, res) => {
  try {
    const ipAddress = decodeURIComponent(req.params.ip);
    const policy = await SecurityService.removeFromBlacklist(ipAddress, req.user);
    res.json({ success: true, message: `IP ${ipAddress} removed from blacklist.`, data: policy.ipPolicy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

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

    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(10000).lean();

    if (format === "csv") {
      const fields = ["createdAt", "userName", "userEmail", "action", "module", "severity", "status", "ipAddress"];
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

// ─── PDF/Excel Report Generation ────────────────────────────────────────────
const generatePDFReport = async (data, res) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="audit-report-${Date.now()}.pdf"`);
      doc.pipe(res);
      
      doc.fontSize(20).font('Helvetica-Bold').text('Audit & Security Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown();
      doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      
      doc.fontSize(14).font('Helvetica-Bold').text('Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Total Events: ${data.summary?.totalEvents || 0}`);
      doc.text(`Failed Logins: ${data.summary?.failedLogins || 0}`);
      doc.text(`Flagged Events: ${data.summary?.flaggedEvents || 0}`);
      doc.text(`Critical Events: ${data.summary?.criticalEventsCount || 0}`);
      doc.moveDown();
      
      if (data.breakdown?.bySeverity && data.breakdown.bySeverity.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Events by Severity');
        doc.moveDown(0.5);
        data.breakdown.bySeverity.forEach(item => {
          doc.fontSize(10).font('Helvetica').text(`• ${item._id}: ${item.count}`);
        });
        doc.moveDown();
      }
      
      if (data.breakdown?.byAction && data.breakdown.byAction.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Top Actions');
        doc.moveDown(0.5);
        data.breakdown.byAction.slice(0, 10).forEach(item => {
          doc.fontSize(10).font('Helvetica').text(`• ${item._id}: ${item.count}`);
        });
        doc.moveDown();
      }
      
      if (data.criticalEvents && data.criticalEvents.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Critical Events');
        doc.moveDown(0.5);
        data.criticalEvents.slice(0, 10).forEach(event => {
          doc.fontSize(9).font('Helvetica');
          doc.text(`• ${event.action} - ${event.module} - ${new Date(event.createdAt).toLocaleDateString()}`);
        });
      }
      
      doc.end();
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

const generateExcelReport = async (data, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Retail POS System';
    workbook.created = new Date();
    
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 20 }];
    summarySheet.addRow({ metric: 'Report Generated', value: new Date().toLocaleString() });
    summarySheet.addRow({ metric: 'Total Events', value: data.summary?.totalEvents || 0 });
    summarySheet.addRow({ metric: 'Failed Logins', value: data.summary?.failedLogins || 0 });
    summarySheet.addRow({ metric: 'Flagged Events', value: data.summary?.flaggedEvents || 0 });
    summarySheet.addRow({ metric: 'Critical Events', value: data.summary?.criticalEventsCount || 0 });
    
    const severitySheet = workbook.addWorksheet('By Severity');
    severitySheet.columns = [{ header: 'Severity', key: 'severity', width: 20 }, { header: 'Count', key: 'count', width: 15 }];
    if (data.breakdown?.bySeverity) data.breakdown.bySeverity.forEach(item => severitySheet.addRow({ severity: item._id, count: item.count }));
    
    const actionsSheet = workbook.addWorksheet('By Action');
    actionsSheet.columns = [{ header: 'Action', key: 'action', width: 25 }, { header: 'Count', key: 'count', width: 15 }];
    if (data.breakdown?.byAction) data.breakdown.byAction.forEach(item => actionsSheet.addRow({ action: item._id, count: item.count }));
    
    const criticalSheet = workbook.addWorksheet('Critical Events');
    criticalSheet.columns = [{ header: 'Time', key: 'time', width: 25 }, { header: 'Action', key: 'action', width: 20 }, { header: 'Module', key: 'module', width: 20 }, { header: 'User', key: 'user', width: 20 }, { header: 'IP', key: 'ip', width: 15 }];
    if (data.criticalEvents) data.criticalEvents.forEach(event => criticalSheet.addRow({ time: new Date(event.createdAt).toLocaleString(), action: event.action, module: event.module, user: event.userName, ip: event.ipAddress }));
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="audit-report-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    throw err;
  }
};

const downloadAuditReport = async (req, res) => {
  try {
    const { format = 'pdf', startDate, endDate, branch } = req.query;
    const reportData = await SecurityService.generateComplianceReport({ startDate, endDate, branch });
    
    await AuditService.fromReq(req, {
      action: "REPORT_GENERATED",
      module: "AUDIT",
      metadata: { reportType: "compliance", format, startDate, endDate },
    });
    
    if (format === 'excel' || format === 'xlsx') {
      await generateExcelReport(reportData, res);
    } else if (format === 'pdf') {
      await generatePDFReport(reportData, res);
    } else if (format === 'csv') {
      const filter = {};
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(10000).lean();
      const fields = ["createdAt", "userName", "userEmail", "action", "module", "severity", "status", "ipAddress"];
      const header = fields.join(",");
      const rows = logs.map((l) => fields.map((f) => { const v = l[f]; return v != null ? `"${String(v).replace(/"/g, '""')}"` : ""; }).join(","));
      const csv = [header, ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-report-${Date.now()}.csv"`);
      return res.send(csv);
    } else {
      res.json({ success: true, data: reportData });
    }
  } catch (err) {
    console.error('Download report error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  getAuditLogs,
  getAuditLogById,
  getAuditStats,
  getLoginAttempts,
  getSecurityEvents,
  resolveSecurityEvent,
  detectSuspiciousActivity,
  getSecurityPolicy,
  updateSecurityPolicy,
  blacklistIP,
  removeBlacklistIP,
  getComplianceReport,
  exportAuditLogs,
  validatePassword,
  downloadAuditReport,
};