const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const {
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
} = require("../controllers/auditController");

// All audit routes require authentication
router.use(protect);

// ─── Audit Logs ─────────────────────────────────────────────────────────────
// ADMIN and SUPER_ADMIN only
router.get("/logs", authorize("ADMIN", "SUPER_ADMIN", "admin"), getAuditLogs);
router.get("/logs/export", authorize("ADMIN", "SUPER_ADMIN", "admin"), exportAuditLogs);
router.get("/logs/flagged", authorize("ADMIN", "SUPER_ADMIN", "admin"), getFlaggedEvents);
router.get("/logs/user/:userId", authorize("ADMIN", "SUPER_ADMIN", "admin"), getUserAuditLogs);
router.get("/logs/:id", authorize("ADMIN", "SUPER_ADMIN", "admin"), getAuditLogById);
router.patch("/logs/:id/flag", authorize("ADMIN", "SUPER_ADMIN", "admin"), flagAuditLog);
router.patch("/logs/:id/review", authorize("ADMIN", "SUPER_ADMIN", "admin"), reviewAuditLog);

// ─── Summary & Analytics ─────────────────────────────────────────────────────
router.get("/summary", authorize("ADMIN", "SUPER_ADMIN", "admin", "MANAGER", "manager"), getAuditSummary);
router.get("/activity-timeline", authorize("ADMIN", "SUPER_ADMIN", "admin", "MANAGER", "manager"), getActivityTimeline);

// ─── Security Monitoring ─────────────────────────────────────────────────────
router.get("/login-attempts", authorize("ADMIN", "SUPER_ADMIN", "admin"), getLoginAttempts);
router.get("/suspicious-activity", authorize("ADMIN", "SUPER_ADMIN", "admin"), detectSuspiciousActivity);

// ─── Security Policy (SUPER_ADMIN only for mutations) ────────────────────────
router.get("/security-policy", authorize("ADMIN", "SUPER_ADMIN", "admin"), getSecurityPolicy);
router.put("/security-policy", authorize("SUPER_ADMIN"), updateSecurityPolicy);
router.post("/security-policy/blacklist", authorize("ADMIN", "SUPER_ADMIN", "admin"), blacklistIP);
router.delete("/security-policy/blacklist/:ip", authorize("ADMIN", "SUPER_ADMIN", "admin"), removeBlacklistIP);

// ─── Compliance ──────────────────────────────────────────────────────────────
router.get("/compliance-report", authorize("ADMIN", "SUPER_ADMIN", "admin"), getComplianceReport);

// ─── Utility ─────────────────────────────────────────────────────────────────
router.post("/validate-password", validatePassword); // open — called on password change screens

module.exports = router;
