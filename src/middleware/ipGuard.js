const SecurityService = require("../services/securityService");
const AuditService = require("../services/auditService");

/**
 * IP Guard Middleware.
 * Mount this EARLY in app.js (before routes) so blacklisted IPs are blocked globally.
 *
 * app.use(ipGuard);
 */
const ipGuard = async (req, res, next) => {
  try {
    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "").split(",")[0].trim();

    const { allowed, reason } = await SecurityService.isIPAllowed(ip);

    if (!allowed) {
      await AuditService.log({
        action: "UNAUTHORIZED_ACCESS",
        module: "SECURITY",
        req,
        status: "BLOCKED",
        severity: "HIGH",
        metadata: { reason },
      });

      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }
  } catch (_) {
    // Don't block the request on policy lookup failure
  }

  next();
};

module.exports = ipGuard;
