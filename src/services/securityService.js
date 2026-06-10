const SecurityPolicy = require("../models/SecurityPolicy");
const LoginAttempt = require("../models/LoginAttempt");
const AuditLog = require("../models/AuditLog");
const AuditService = require("./auditService");

// In-memory cache for the active policy (TTL = 5 min)
let _policyCache = null;
let _policyCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const SecurityService = {
  // ─── Policy ────────────────────────────────────────────────────────────────

  async getActivePolicy() {
    const now = Date.now();
    if (_policyCache && now - _policyCacheAt < CACHE_TTL_MS) {
      return _policyCache;
    }
    let policy = await SecurityPolicy.findOne({ isActive: true }).lean();
    if (!policy) {
      policy = await SecurityService.createDefaultPolicy();
    }
    _policyCache = policy;
    _policyCacheAt = now;
    return policy;
  },

  invalidatePolicyCache() {
    _policyCache = null;
  },

  async createDefaultPolicy() {
    const def = new SecurityPolicy({
      name: "default",
      description: "System default security policy",
      isActive: true,
    });
    await def.save();
    return def.toObject();
  },

  async updatePolicy(updates, updatedBy) {
    SecurityService.invalidatePolicyCache();
    const policy = await SecurityPolicy.findOneAndUpdate(
      { isActive: true },
      { ...updates, updatedBy: updatedBy?._id },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
    await AuditService.log({
      user: updatedBy,
      action: "SECURITY_POLICY_UPDATED",
      module: "SECURITY",
      severity: "CRITICAL",
      metadata: { updatedFields: Object.keys(updates) },
    });
    return policy;
  },

  // ─── Login Attempt Tracking ─────────────────────────────────────────────────

  async recordLoginAttempt({ email, ipAddress, userAgent, success, failureReason = null, userId = null }) {
    const attempt = new LoginAttempt({ email, ipAddress, userAgent, success, failureReason, userId });
    await attempt.save();
    return attempt;
  },

  /**
   * Check if an account or IP should be blocked.
   * Returns { blocked: true, reason, remainingMinutes } or { blocked: false }
   */
  async checkBruteForce(email, ipAddress) {
    const policy = await SecurityService.getActivePolicy();
    const lp = policy.lockoutPolicy;
    if (!lp.enabled) return { blocked: false };

    const window = new Date(Date.now() - lp.resetAfterMinutes * 60 * 1000);

    // Check by email
    const emailAttempts = await LoginAttempt.countDocuments({
      email: email.toLowerCase(),
      success: false,
      createdAt: { $gte: window },
    });

    if (emailAttempts >= lp.maxAttempts) {
      const oldest = await LoginAttempt.findOne({ email: email.toLowerCase(), success: false, createdAt: { $gte: window } }).sort({ createdAt: 1 });
      const lockUntil = new Date(oldest.createdAt.getTime() + lp.lockoutDurationMinutes * 60 * 1000);
      const remainingMs = lockUntil - Date.now();
      if (remainingMs > 0) {
        return { blocked: true, reason: "Account temporarily locked due to too many failed login attempts.", remainingMinutes: Math.ceil(remainingMs / 60000) };
      }
    }

    // Check by IP (2x threshold)
    const ipAttempts = await LoginAttempt.countDocuments({
      ipAddress,
      success: false,
      createdAt: { $gte: window },
    });

    if (ipAttempts >= lp.maxAttempts * 2) {
      return { blocked: true, reason: "IP address temporarily blocked due to suspicious activity.", remainingMinutes: lp.lockoutDurationMinutes };
    }

    return { blocked: false };
  },

  async getRecentFailedAttempts(email, ipAddress, windowMinutes = 60) {
    const window = new Date(Date.now() - windowMinutes * 60 * 1000);
    return LoginAttempt.find({
      $or: [{ email: email.toLowerCase() }, { ipAddress }],
      success: false,
      createdAt: { $gte: window },
    }).sort({ createdAt: -1 });
  },

  // ─── Suspicious Activity Detection ─────────────────────────────────────────

  /**
   * Detect and flag suspicious patterns.
   * Called periodically or after each login failure.
   */
  async detectSuspiciousActivity() {
    const flags = [];
    const windowStart = new Date(Date.now() - 60 * 60 * 1000); // 1 hour

    // 1. IPs with many failed logins from many different accounts
    const suspiciousIPs = await LoginAttempt.aggregate([
      { $match: { success: false, createdAt: { $gte: windowStart } } },
      { $group: { _id: "$ipAddress", attempts: { $sum: 1 }, uniqueEmails: { $addToSet: "$email" } } },
      { $addFields: { uniqueEmailCount: { $size: "$uniqueEmails" } } },
      { $match: { attempts: { $gte: 20 }, uniqueEmailCount: { $gte: 3 } } },
    ]);

    for (const ip of suspiciousIPs) {
      flags.push({ type: "BRUTE_FORCE_IP", ipAddress: ip._id, attempts: ip.attempts, uniqueEmails: ip.uniqueEmailCount });
      await AuditService.log({
        action: "SUSPICIOUS_ACTIVITY",
        module: "SECURITY",
        severity: "CRITICAL",
        status: "BLOCKED",
        metadata: { type: "BRUTE_FORCE_IP", ipAddress: ip._id, attempts: ip.attempts },
      });
    }

    // 2. Accounts with rapid role changes
    const recentRoleChanges = await AuditLog.aggregate([
      { $match: { action: "ROLE_CHANGED", createdAt: { $gte: windowStart } } },
      { $group: { _id: "$resourceId", count: { $sum: 1 } } },
      { $match: { count: { $gte: 3 } } },
    ]);

    for (const rc of recentRoleChanges) {
      flags.push({ type: "RAPID_ROLE_CHANGE", userId: rc._id, count: rc.count });
      await AuditLog.updateMany(
        { action: "ROLE_CHANGED", resourceId: rc._id, createdAt: { $gte: windowStart } },
        { flagged: true, flagReason: "Rapid role change detected" }
      );
    }

    // 3. Unusual off-hours admin actions (11pm–5am)
    const now = new Date();
    const hour = now.getUTCHours();
    if (hour >= 23 || hour <= 5) {
      const offHoursAdmin = await AuditLog.countDocuments({
        userRole: { $in: ["ADMIN", "SUPER_ADMIN"] },
        action: { $in: ["USER_DELETED", "ROLE_CHANGED", "SECURITY_POLICY_UPDATED", "BULK_DELETE"] },
        createdAt: { $gte: windowStart },
      });
      if (offHoursAdmin > 0) {
        flags.push({ type: "OFF_HOURS_ADMIN_ACTION", count: offHoursAdmin });
      }
    }

    return flags;
  },

  // ─── IP Policy ──────────────────────────────────────────────────────────────

  async isIPAllowed(ipAddress) {
    const policy = await SecurityService.getActivePolicy();
    const { ipPolicy } = policy;

    if (ipPolicy.enableBlacklist && ipPolicy.blacklist?.includes(ipAddress)) {
      return { allowed: false, reason: "IP is blacklisted" };
    }
    if (ipPolicy.enableWhitelist && ipPolicy.whitelist?.length > 0 && !ipPolicy.whitelist.includes(ipAddress)) {
      return { allowed: false, reason: "IP not in whitelist" };
    }
    return { allowed: true };
  },

  async addToBlacklist(ipAddress, updatedBy) {
    const policy = await SecurityPolicy.findOne({ isActive: true });
    if (!policy.ipPolicy.blacklist.includes(ipAddress)) {
      policy.ipPolicy.blacklist.push(ipAddress);
      await policy.save();
      SecurityService.invalidatePolicyCache();
      await AuditService.log({
        user: updatedBy,
        action: "SECURITY_POLICY_UPDATED",
        module: "SECURITY",
        severity: "HIGH",
        metadata: { change: "IP_BLACKLISTED", ipAddress },
      });
    }
    return policy;
  },

  async removeFromBlacklist(ipAddress, updatedBy) {
    const policy = await SecurityPolicy.findOne({ isActive: true });
    policy.ipPolicy.blacklist = policy.ipPolicy.blacklist.filter((ip) => ip !== ipAddress);
    await policy.save();
    SecurityService.invalidatePolicyCache();
    await AuditService.log({
      user: updatedBy,
      action: "SECURITY_POLICY_UPDATED",
      module: "SECURITY",
      severity: "MEDIUM",
      metadata: { change: "IP_REMOVED_FROM_BLACKLIST", ipAddress },
    });
    return policy;
  },

  // ─── Compliance Reports ─────────────────────────────────────────────────────

  async generateComplianceReport({ startDate, endDate, branch } = {}) {
    const match = {};
    if (startDate) match.createdAt = { $gte: new Date(startDate) };
    if (endDate) match.createdAt = { ...(match.createdAt || {}), $lte: new Date(endDate) };
    if (branch) match.branch = branch;

    const [
      totalEvents,
      byAction,
      bySeverity,
      byStatus,
      byModule,
      byUser,
      failedLogins,
      flaggedEvents,
      criticalEvents,
      topIPs,
    ] = await Promise.all([
      AuditLog.countDocuments(match),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$action", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$severity", count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$module", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      AuditLog.aggregate([
        { $match: { ...match, user: { $ne: null } } },
        { $group: { _id: { user: "$user", userName: "$userName", userRole: "$userRole" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.countDocuments({ ...match, action: "LOGIN_FAILED" }),
      AuditLog.countDocuments({ ...match, flagged: true }),
      AuditLog.find({ ...match, severity: "CRITICAL" }).sort({ createdAt: -1 }).limit(20).lean(),
      AuditLog.aggregate([
        { $match: { ...match, ipAddress: { $ne: "SYSTEM" } } },
        { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return {
      generatedAt: new Date(),
      period: { startDate, endDate },
      summary: {
        totalEvents,
        failedLogins,
        flaggedEvents,
        criticalEventsCount: criticalEvents.length,
      },
      breakdown: {
        byAction,
        bySeverity,
        byStatus,
        byModule,
      },
      topUsers: byUser.map((u) => ({
        userId: u._id.user,
        userName: u._id.userName,
        userRole: u._id.userRole,
        activityCount: u.count,
      })),
      topIPs,
      criticalEvents,
    };
  },

  // ─── Password Validation ────────────────────────────────────────────────────

  async validatePassword(password) {
    const policy = await SecurityService.getActivePolicy();
    const pp = policy.passwordPolicy;
    const errors = [];

    if (password.length < pp.minLength) errors.push(`Minimum ${pp.minLength} characters required.`);
    if (pp.requireUppercase && !/[A-Z]/.test(password)) errors.push("At least one uppercase letter required.");
    if (pp.requireLowercase && !/[a-z]/.test(password)) errors.push("At least one lowercase letter required.");
    if (pp.requireNumbers && !/\d/.test(password)) errors.push("At least one number required.");
    if (pp.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("At least one special character required.");

    return { valid: errors.length === 0, errors };
  },
};

module.exports = SecurityService;
