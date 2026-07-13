const AuditLog = require("../models/Auditlog");
const SecurityEvent = require("../models/SecurityEvent");
const Employee = require("../models/User");
const User = require("../models/User");

const AuditService = {
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

      let userName = "System";
      let userRole = "SYSTEM";
      let userEmail = "";
      let userBranch = null;
      let userBranchName = null;

      const getEmployeeDetails = async (userId) => {
        try {
          const employee = await Employee.findById(userId).populate('branch', 'name');
          if (employee) {
            const empName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
            return {
              userName: empName || employee.name || null,
              userRole: employee.role || null,
              userEmail: employee.email || null,
              userBranch: employee.branch || null,
              userBranchName: employee.branch ? employee.branch.name : null,
            };
          }
          return null;
        } catch (err) {
          return null;
        }
      };

      const getUserDetails = (userObj) => {
        return {
          userName: userObj.name || `${userObj.firstName || ""} ${userObj.lastName || ""}`.trim() || userObj.email || "Unknown",
          userRole: userObj.role || "STAFF",
          userEmail: userObj.email || "",
          userBranch: userObj.branch || null,
        };
      };

      if (user) {
        const userDetails = getUserDetails(user);
        userName = userDetails.userName;
        userRole = userDetails.userRole;
        userEmail = userDetails.userEmail;
        userBranch = userDetails.userBranch;

        const employeeDetails = await getEmployeeDetails(user._id || user.id);
        if (employeeDetails) {
          userName = employeeDetails.userName || userName;
          userRole = employeeDetails.userRole || userRole;
          userEmail = employeeDetails.userEmail || userEmail;
          userBranch = employeeDetails.userBranch || userBranch;
          userBranchName = employeeDetails.userBranchName || null;
        }
      }

      if (!user && req && req.user) {
        const reqUser = req.user;
        const userDetails = getUserDetails(reqUser);
        userName = userDetails.userName;
        userRole = userDetails.userRole;
        userEmail = userDetails.userEmail;
        userBranch = userDetails.userBranch;

        const employeeDetails = await getEmployeeDetails(reqUser._id || reqUser.id);
        if (employeeDetails) {
          userName = employeeDetails.userName || userName;
          userRole = employeeDetails.userRole || userRole;
          userEmail = employeeDetails.userEmail || userEmail;
          userBranch = employeeDetails.userBranch || userBranch;
          userBranchName = employeeDetails.userBranchName || null;
        }
      }

      if ((!user || userName === "System") && req && req.body) {
        const { email } = req.body;
        if (email) {
          userEmail = email;
          try {
            const employee = await Employee.findOne({ email: email.toLowerCase() }).populate('branch', 'name');
            if (employee) {
              const empName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
              userName = empName || employee.name || email.split('@')[0];
              userRole = employee.role || "STAFF";
              userEmail = employee.email || email;
              userBranch = employee.branch || null;
              userBranchName = employee.branchName || null;
            } else {
              userName = email.split('@')[0]
                .replace(/[_.-]/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            }
          } catch (err) {
            // Silent fail
          }
        }
      }

      if ((userName === "System" || userName === "Unknown") && userEmail) {
        userName = userEmail.split('@')[0]
          .replace(/[_.-]/g, ' ')
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }

      if (userRole === "SYSTEM" && user && user.role) {
        userRole = user.role;
      }

      const entry = {
        user: user?._id || user?.id || null,
        userName: userName,
        userRole: userRole,
        userEmail: userEmail,
        action,
        module,
        resourceType,
        resourceId,
        resourceName,
        ipAddress,
        userAgent: req?.headers?.["user-agent"] || null,
        method: req?.method || "SYSTEM",
        endpoint: req?.originalUrl || null,
        previousValues: previousValues ? AuditService._sanitizeData(previousValues) : null,
        newValues: newValues ? AuditService._sanitizeData(newValues) : null,
        metadata: AuditService._sanitizeData(metadata),
        severity: severity === "INFO" ? AuditService._inferSeverity(action, status) : severity,
        status,
        branch: branch || userBranch || null,
        branchName: branchName || userBranchName || null,
        sessionId,
      };

      if (["SUSPICIOUS_ACTIVITY", "UNAUTHORIZED_ACCESS", "ACCOUNT_LOCKED", "LOGIN_FAILED"].includes(action) ||
          entry.severity === "CRITICAL" || entry.severity === "HIGH") {
        entry.flagged = true;
        entry.flagReason = `Auto-flagged: ${action}`;
        await AuditService._createSecurityEvent(entry, action);
      }

      const log = new AuditLog(entry);
      await log.save();
      return log;
    } catch (err) {
      console.error("[AuditService] Failed to write audit log:", err.message);
      return null;
    }
  },

  async _createSecurityEvent(auditEntry, action) {
    try {
      const eventTypeMap = {
        "LOGIN_FAILED": "BRUTE_FORCE",
        "ACCOUNT_LOCKED": "BRUTE_FORCE",
        "UNAUTHORIZED_ACCESS": "UNAUTHORIZED_ACCESS",
        "SUSPICIOUS_ACTIVITY": "MULTIPLE_FAILURES",
        "ROLE_CHANGED": "PRIVILEGE_ESCALATION",
        "SECURITY_POLICY_UPDATED": "CONFIG_CHANGE",
      };
      
      const eventType = eventTypeMap[action] || "UNAUTHORIZED_ACCESS";
      
      const securityEvent = new SecurityEvent({
        type: eventType,
        severity: auditEntry.severity === "CRITICAL" ? "CRITICAL" : 
                  auditEntry.severity === "HIGH" ? "HIGH" : "MEDIUM",
        description: `${action} detected from IP ${auditEntry.ipAddress}`,
        ipAddress: auditEntry.ipAddress,
        userId: auditEntry.user,
        userName: auditEntry.userName,
        module: auditEntry.module,
        metadata: auditEntry.metadata,
      });
      await securityEvent.save();
    } catch (err) {
      // Silent fail
    }
  },

  async fromReq(req, { action, module, ...rest }) {
    return AuditService.log({ user: req.user, req, action, module, ...rest });
  },

  _sanitizeData(data) {
    if (!data || typeof data !== "object") return data;
    const sanitized = { ...data };
    const sensitiveFields = ["password", "newPassword", "currentPassword", "token", "secret", "creditCard", "cvv"];
    for (const field of sensitiveFields) {
      if (field in sanitized) sanitized[field] = "[REDACTED]";
    }
    return sanitized;
  },

  _inferSeverity(action, status) {
    const critical = ["ACCOUNT_LOCKED", "UNAUTHORIZED_ACCESS", "SUSPICIOUS_ACTIVITY", "SECURITY_POLICY_UPDATED"];
    const high = ["LOGIN_FAILED", "USER_DELETED", "BULK_DELETE", "SALE_VOIDED", "PERMISSION_DENIED"];
    const medium = ["USER_CREATED", "USER_UPDATED", "PASSWORD_CHANGE", "STOCK_ADJUSTED"];

    if (status === "FAILURE" || status === "BLOCKED") return "HIGH";
    if (critical.includes(action)) return "CRITICAL";
    if (high.includes(action)) return "HIGH";
    if (medium.includes(action)) return "MEDIUM";
    return "INFO";
  },

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

  async getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [totalEvents, loginAttempts, failedLogins, securityAlerts, activeSessions] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      AuditLog.countDocuments({ action: "LOGIN", createdAt: { $gte: thirtyDaysAgo } }),
      AuditLog.countDocuments({ action: "LOGIN_FAILED", createdAt: { $gte: thirtyDaysAgo } }),
      AuditLog.countDocuments({ severity: { $in: ["HIGH", "CRITICAL"] }, createdAt: { $gte: thirtyDaysAgo } }),
      AuditLog.aggregate([
        { $match: { action: "LOGIN", createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: "$user" } },
        { $count: "count" }
      ]),
    ]);

    return {
      totalEvents,
      loginAttempts: loginAttempts + failedLogins,
      failedLogins,
      securityAlerts,
      unresolvedAlerts: await AuditLog.countDocuments({ severity: { $in: ["HIGH", "CRITICAL"] }, flagged: true, reviewedBy: null }),
      activeSessions: activeSessions[0]?.count || 0,
      uniqueUsers: await AuditLog.distinct("user", { createdAt: { $gte: thirtyDaysAgo } }).then(users => users.length),
      eventsTrend: 12,
      loginTrend: -3,
      alertsTrend: 8,
    };
  },
};

module.exports = AuditService;