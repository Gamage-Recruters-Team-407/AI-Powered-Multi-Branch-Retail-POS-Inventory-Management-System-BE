const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const {
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
  downloadAuditReport,  // Add this
} = require("../controllers/auditController");

router.use(protect);

// Audit Logs
router.get("/logs", authorize("ADMIN", "SUPER_ADMIN", "admin"), getAuditLogs);
router.get("/logs/export", authorize("ADMIN", "SUPER_ADMIN", "admin"), exportAuditLogs);
router.get("/logs/:id", authorize("ADMIN", "SUPER_ADMIN", "admin"), getAuditLogById);

// Stats
router.get("/stats", authorize("ADMIN", "SUPER_ADMIN", "admin", "MANAGER"), getAuditStats);

// Login History
router.get("/login-attempts", authorize("ADMIN", "SUPER_ADMIN", "admin"), getLoginAttempts);

// Security Events
router.get("/security-events", authorize("ADMIN", "SUPER_ADMIN", "admin"), getSecurityEvents);
router.get("/suspicious-activity", authorize("ADMIN", "SUPER_ADMIN", "admin"), detectSuspiciousActivity);
router.patch("/security-events/:id/resolve", authorize("ADMIN", "SUPER_ADMIN", "admin"), resolveSecurityEvent);

// Security Policy
router.get("/security-policy", authorize("ADMIN", "SUPER_ADMIN", "admin"), getSecurityPolicy);
router.put("/security-policy", authorize("SUPER_ADMIN"), updateSecurityPolicy);
router.post("/security-policy/blacklist", authorize("ADMIN", "SUPER_ADMIN", "admin"), blacklistIP);
router.delete("/security-policy/blacklist/:ip", authorize("ADMIN", "SUPER_ADMIN", "admin"), removeBlacklistIP);

// Compliance & Reports
router.get("/compliance-report", authorize("ADMIN", "SUPER_ADMIN", "admin"), getComplianceReport);
router.get("/reports/download", authorize("ADMIN", "SUPER_ADMIN", "admin"), downloadAuditReport);  // Add this

// Utility
router.post("/validate-password", validatePassword);

module.exports = router;