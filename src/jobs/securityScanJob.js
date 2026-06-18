const cron = require("node-cron");
const SecurityService = require("../services/securityService");
const AuditService = require("../services/auditService");
const AuditLog = require("../models/AuditLog");

/**
 * Security scan job.
 * - Runs every 15 minutes for suspicious activity detection.
 * - Runs daily to auto-blacklist repeat offender IPs.
 */

/**
 * Periodic suspicious activity scan (every 15 minutes).
 */
const startSuspiciousActivityScan = () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const flags = await SecurityService.detectSuspiciousActivity();
      if (flags.length > 0) {
        console.log(`[SecurityScan] ${flags.length} suspicious pattern(s) detected.`);
        await AuditService.log({
          action: "SUSPICIOUS_ACTIVITY",
          module: "SECURITY",
          severity: flags.some((f) => f.type === "BRUTE_FORCE_IP") ? "CRITICAL" : "HIGH",
          status: "SUCCESS",
          metadata: { flags, scanType: "SCHEDULED" },
        });
      }
    } catch (err) {
      console.error("[SecurityScan] Scan failed:", err.message);
    }
  });

  console.log("[SecurityScan] Suspicious activity scan scheduled (every 15 min).");
};

/**
 * Daily: Auto-blacklist IPs that have been blocked 50+ times in the last 7 days.
 */
const startAutoBlacklistJob = () => {
  cron.schedule("0 2 * * *", async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const offenders = await AuditLog.aggregate([
        {
          $match: {
            status: "BLOCKED",
            ipAddress: { $nin: ["SYSTEM", "unknown", null] },
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
        { $match: { count: { $gte: 50 } } },
      ]);

      for (const offender of offenders) {
        await SecurityService.addToBlacklist(offender._id, null);
        console.log(`[AutoBlacklist] Blacklisted IP: ${offender._id} (${offender.count} blocked events in 7 days)`);
      }

      if (offenders.length > 0) {
        await AuditService.log({
          action: "SECURITY_POLICY_UPDATED",
          module: "SECURITY",
          severity: "HIGH",
          metadata: { change: "AUTO_BLACKLIST", count: offenders.length, ips: offenders.map((o) => o._id) },
        });
      }
    } catch (err) {
      console.error("[AutoBlacklist] Job failed:", err.message);
    }
  });

  console.log("[AutoBlacklist] Auto-blacklist job scheduled (daily at 2 AM).");
};

/**
 * Daily: Clean up audit logs older than retention policy.
 */
const startAuditRetentionJob = () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      const policy = await SecurityService.getActivePolicy();
      const retentionDays = policy.auditPolicy?.retentionDays || 730;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await AuditLog.deleteMany({
        createdAt: { $lt: cutoff },
        flagged: false, // Never delete flagged events automatically
      });

      if (result.deletedCount > 0) {
        console.log(`[AuditRetention] Deleted ${result.deletedCount} logs older than ${retentionDays} days.`);
        await AuditService.log({
          action: "SYSTEM_STARTUP",
          module: "SYSTEM",
          severity: "INFO",
          metadata: { task: "AUDIT_RETENTION_CLEANUP", deletedCount: result.deletedCount, retentionDays },
        });
      }
    } catch (err) {
      console.error("[AuditRetention] Job failed:", err.message);
    }
  });

  console.log("[AuditRetention] Retention cleanup job scheduled (daily at 3 AM).");
};

const startSecurityJobs = () => {
  startSuspiciousActivityScan();
  startAutoBlacklistJob();
  startAuditRetentionJob();
};

module.exports = { startSecurityJobs };
