const AuditService = require("../services/auditService");

/**
 * Map HTTP methods + route patterns to (action, module, severity)
 */
const ROUTE_MAP = [
  // Auth
  { pattern: /^\/api\/auth\/login$/, method: "POST", action: "LOGIN", module: "AUTH" },
  { pattern: /^\/api\/auth\/logout/, method: "POST", action: "LOGOUT", module: "AUTH" },
  { pattern: /^\/api\/auth\/register$/, method: "POST", action: "USER_CREATED", module: "AUTH" },
  { pattern: /^\/api\/auth\/forgot-password/, method: "POST", action: "PASSWORD_RESET_REQUEST", module: "AUTH" },
  { pattern: /^\/api\/auth\/reset-password/, method: "POST", action: "PASSWORD_RESET_COMPLETE", module: "AUTH" },
  { pattern: /^\/api\/auth\/change-password/, method: "POST", action: "PASSWORD_CHANGE", module: "AUTH" },

  // Users
  { pattern: /^\/api\/users$/, method: "POST", action: "USER_CREATED", module: "USER_MANAGEMENT" },
  { pattern: /^\/api\/users\/[^/]+$/, method: "PUT", action: "USER_UPDATED", module: "USER_MANAGEMENT" },
  { pattern: /^\/api\/users\/[^/]+$/, method: "PATCH", action: "USER_UPDATED", module: "USER_MANAGEMENT" },
  { pattern: /^\/api\/users\/[^/]+$/, method: "DELETE", action: "USER_DELETED", module: "USER_MANAGEMENT" },

  // Products
  { pattern: /^\/api\/products$/, method: "POST", action: "CREATE", module: "PRODUCT" },
  { pattern: /^\/api\/products\/[^/]+$/, method: "PUT", action: "UPDATE", module: "PRODUCT" },
  { pattern: /^\/api\/products\/[^/]+$/, method: "PATCH", action: "UPDATE", module: "PRODUCT" },
  { pattern: /^\/api\/products\/[^/]+$/, method: "DELETE", action: "DELETE", module: "PRODUCT" },

  // Inventory
  { pattern: /^\/api\/inventory/, method: "POST", action: "STOCK_ADJUSTED", module: "INVENTORY" },
  { pattern: /^\/api\/inventory/, method: "PUT", action: "STOCK_ADJUSTED", module: "INVENTORY" },
  { pattern: /^\/api\/inventory/, method: "PATCH", action: "STOCK_ADJUSTED", module: "INVENTORY" },

  // Sales
  { pattern: /^\/api\/sales$/, method: "POST", action: "SALE_COMPLETED", module: "SALES" },
  { pattern: /^\/api\/sales\/[^/]+\/void/, method: "POST", action: "SALE_VOIDED", module: "SALES" },
  { pattern: /^\/api\/returns/, method: "POST", action: "REFUND_PROCESSED", module: "RETURN" },

  // Stock transfers
  { pattern: /^\/api\/stock-transfers$/, method: "POST", action: "STOCK_TRANSFER_INITIATED", module: "STOCK_TRANSFER" },
  { pattern: /^\/api\/stock-transfers\/[^/]+\/approve/, method: "POST", action: "STOCK_TRANSFER_APPROVED", module: "STOCK_TRANSFER" },
  { pattern: /^\/api\/stock-transfers\/[^/]+\/reject/, method: "POST", action: "STOCK_TRANSFER_REJECTED", module: "STOCK_TRANSFER" },

  // Purchase Orders
  { pattern: /^\/api\/purchase-orders$/, method: "POST", action: "PURCHASE_ORDER_CREATED", module: "PURCHASE_ORDER" },
  { pattern: /^\/api\/purchase-orders\/[^/]+\/approve/, method: "POST", action: "PURCHASE_ORDER_APPROVED", module: "PURCHASE_ORDER" },

  // Suppliers
  { pattern: /^\/api\/suppliers$/, method: "POST", action: "CREATE", module: "SUPPLIER" },
  { pattern: /^\/api\/suppliers\/[^/]+$/, method: "PUT", action: "UPDATE", module: "SUPPLIER" },
  { pattern: /^\/api\/suppliers\/[^/]+$/, method: "DELETE", action: "DELETE", module: "SUPPLIER" },

  // Customers
  { pattern: /^\/api\/customers$/, method: "POST", action: "CREATE", module: "CUSTOMER" },
  { pattern: /^\/api\/customers\/[^/]+$/, method: "PUT", action: "UPDATE", module: "CUSTOMER" },
  { pattern: /^\/api\/customers\/[^/]+$/, method: "DELETE", action: "DELETE", module: "CUSTOMER" },

  // Employees
  { pattern: /^\/api\/employees$/, method: "POST", action: "CREATE", module: "EMPLOYEE" },
  { pattern: /^\/api\/employees\/[^/]+$/, method: "PUT", action: "UPDATE", module: "EMPLOYEE" },
  { pattern: /^\/api\/employees\/[^/]+$/, method: "DELETE", action: "DELETE", module: "EMPLOYEE" },

  // Promotions
  { pattern: /^\/api\/promotions$/, method: "POST", action: "CREATE", module: "PROMOTION" },
  { pattern: /^\/api\/promotions\/[^/]+$/, method: "PUT", action: "UPDATE", module: "PROMOTION" },
  { pattern: /^\/api\/promotions\/[^/]+$/, method: "DELETE", action: "DELETE", module: "PROMOTION" },

  // Reports
  { pattern: /^\/api\/reports/, method: "POST", action: "REPORT_GENERATED", module: "REPORT" },
  { pattern: /^\/api\/reports\/export/, method: "GET", action: "REPORT_EXPORTED", module: "REPORT" },

  // Branches & Warehouses
  { pattern: /^\/api\/branches$/, method: "POST", action: "CREATE", module: "BRANCH" },
  { pattern: /^\/api\/branches\/[^/]+$/, method: "PUT", action: "UPDATE", module: "BRANCH" },
  { pattern: /^\/api\/branches\/[^/]+$/, method: "DELETE", action: "DELETE", module: "BRANCH" },
  { pattern: /^\/api\/warehouses$/, method: "POST", action: "CREATE", module: "WAREHOUSE" },
  { pattern: /^\/api\/warehouses\/[^/]+$/, method: "PUT", action: "UPDATE", module: "WAREHOUSE" },
  { pattern: /^\/api\/warehouses\/[^/]+$/, method: "DELETE", action: "DELETE", module: "WAREHOUSE" },

  // Audit / Security
  { pattern: /^\/api\/audit\/security-policy/, method: "PUT", action: "SECURITY_POLICY_UPDATED", module: "SECURITY" },
  { pattern: /^\/api\/audit\/security-policy/, method: "PATCH", action: "SECURITY_POLICY_UPDATED", module: "SECURITY" },
];

/**
 * Auto-audit middleware.
 * Attach AFTER authMiddleware so req.user is available.
 * Only logs mutating requests (POST, PUT, PATCH, DELETE) by default.
 */
const auditMiddleware = (options = {}) => {
  const { logGets = false } = options;

  return async (req, res, next) => {
    // Skip read-only unless configured
    if (!logGets && req.method === "GET") return next();

    // Find matching route config
    const path = req.path || req.url || "";
    const routeConfig = ROUTE_MAP.find(
      (r) => r.method === req.method && r.pattern.test(path)
    );

    if (!routeConfig) return next();

    // Intercept response to capture status
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      setImmediate(async () => {
        try {
          const status = res.statusCode >= 400 ? "FAILURE" : "SUCCESS";
          await AuditService.log({
            user: req.user || null,
            action: routeConfig.action,
            module: routeConfig.module,
            req,
            status,
            metadata: {
              statusCode: res.statusCode,
              requestBody: _sanitizeBody(req.body),
            },
          });
        } catch (_) {
          // Never block the response
        }
      });
      return originalJson(body);
    };

    next();
  };
};

/** Remove sensitive fields before logging */
function _sanitizeBody(body = {}) {
  if (!body || typeof body !== "object") return {};
  const sanitized = { ...body };
  const redact = ["password", "newPassword", "currentPassword", "token", "secret", "creditCard"];
  for (const key of redact) {
    if (key in sanitized) sanitized[key] = "[REDACTED]";
  }
  return sanitized;
}

/**
 * Rate-limit middleware with audit logging.
 * Simple in-memory implementation (use Redis for production multi-instance).
 */
const _rateLimitStore = new Map();

const rateLimitMiddleware = ({ windowMs = 15 * 60 * 1000, maxRequests = 100, message = "Too many requests" } = {}) => {
  return async (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const record = _rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;
    _rateLimitStore.set(key, record);

    if (record.count > maxRequests) {
      await AuditService.log({
        user: req.user || null,
        action: "RATE_LIMIT_EXCEEDED",
        module: "SECURITY",
        req,
        status: "BLOCKED",
        severity: "HIGH",
        metadata: { path: req.path, count: record.count, maxRequests },
      });
      return res.status(429).json({ success: false, message, retryAfter: Math.ceil((record.resetAt - now) / 1000) });
    }

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - record.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetAt / 1000));
    next();
  };
};

module.exports = { auditMiddleware, rateLimitMiddleware };
