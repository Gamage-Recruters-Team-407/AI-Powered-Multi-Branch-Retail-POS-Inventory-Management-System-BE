const SecurityPolicy = require("../models/SecurityPolicy");
const LoginAttempt = require("../models/LoginAttempt");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const LoginSession = require("../models/LoginSession");
const AuditService = require("./auditService");

let _policyCache = null;
let _policyCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const SecurityService = {
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

  async recordLoginAttempt({ email, ipAddress, userAgent, success, failureReason = null, userId = null }) {
    const attempt = new LoginAttempt({ email, ipAddress, userAgent, success, failureReason, userId });
    await attempt.save();
    return attempt;
  },

  async checkBruteForce(email, ipAddress) {
    const policy = await SecurityService.getActivePolicy();
    const lp = policy.lockoutPolicy;
    if (!lp.enabled) return { blocked: false };

    const window = new Date(Date.now() - lp.resetAfterMinutes * 60 * 1000);

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

  async detectSuspiciousActivity() {
    const flags = [];
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);

    const suspiciousIPs = await LoginAttempt.aggregate([
      { $match: { success: false, createdAt: { $gte: windowStart } } },
      { $group: { _id: "$ipAddress", attempts: { $sum: 1 }, uniqueEmails: { $addToSet: "$email" } } },
      { $addFields: { uniqueEmailCount: { $size: "$uniqueEmails" } } },
      { $match: { attempts: { $gte: 20 }, uniqueEmailCount: { $gte: 3 } } },
    ]);

    for (const ip of suspiciousIPs) {
      flags.push({ type: "BRUTE_FORCE_IP", ipAddress: ip._id, attempts: ip.attempts, uniqueEmails: ip.uniqueEmailCount });
      
      const existingEvent = await SecurityEvent.findOne({ type: "BRUTE_FORCE", ipAddress: ip._id, resolved: false });
      if (!existingEvent) {
        await SecurityEvent.create({
          type: "BRUTE_FORCE",
          severity: "HIGH",
          description: `Brute force attack detected from IP ${ip._id} with ${ip.attempts} attempts across ${ip.uniqueEmailCount} accounts`,
          ipAddress: ip._id,
          metadata: { attempts: ip.attempts, uniqueEmails: ip.uniqueEmailCount },
        });
      }
    }

    return flags;
  },

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
    return policy;
  },

  async generateComplianceReport({ startDate, endDate, branch } = {}) {
    const match = {};
    if (startDate) match.createdAt = { $gte: new Date(startDate) };
    if (endDate) match.createdAt = { ...(match.createdAt || {}), $lte: new Date(endDate) };
    if (branch) match.branch = branch;

    const [totalEvents, byAction, bySeverity, byStatus, byModule, flaggedEvents, criticalEvents] = await Promise.all([
      AuditLog.countDocuments(match),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$action", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$severity", count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      AuditLog.aggregate([{ $match: match }, { $group: { _id: "$module", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      AuditLog.countDocuments({ ...match, flagged: true }),
      AuditLog.find({ ...match, severity: "CRITICAL" }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    return {
      generatedAt: new Date(),
      period: { startDate, endDate },
      summary: { totalEvents, flaggedEvents, criticalEventsCount: criticalEvents.length },
      breakdown: { byAction, bySeverity, byStatus, byModule },
      criticalEvents,
    };
  },

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

  // Session Management Functions
  async createSession(user, req) {
    const sessionId = require("crypto").randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const session = new LoginSession({
      sessionId,
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      ipAddress: req?.ip || req?.socket?.remoteAddress,
      userAgent: req?.headers?.["user-agent"],
      expiresAt,
      lastActivityAt: new Date(),
    });
    await session.save();
    return session;
  },

  async validateSession(sessionId) {
    const session = await LoginSession.findOne({ sessionId, isActive: true, expiresAt: { $gt: new Date() } });
    if (!session) return null;
    
    session.lastActivityAt = new Date();
    await session.save();
    return session;
  },

  async revokeSession(sessionId, reason = "User logout") {
    const session = await LoginSession.findOne({ sessionId });
    if (session) {
      session.isActive = false;
      session.revokedAt = new Date();
      session.revocationReason = reason;
      await session.save();
    }
    return session;
  },
};

module.exports = SecurityService;