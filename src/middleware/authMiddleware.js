const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SecurityService = require("../services/securityService");

// ── 1. PROTECT MIDDLEWARE ──────────────────────────────────────────────────
const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate session if sessionId exists in token
    if (decoded.sessionId) {
      const session = await SecurityService.validateSession(decoded.sessionId);
      if (!session) {
        return res.status(401).json({ success: false, message: "Session expired or invalid" });
      }
      req.session = session;
    }
    
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: "Account disabled or user not found" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token invalid or expired" });
  }
};

// ── 2. AUTHORIZE MIDDLEWARE (Single role or multiple roles) ─────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not allowed to access this resource`,
      });
    }
    next();
  };
};

// ── 3. AUTHORIZE ROLES (Alias for authorize - for backward compatibility) ───
const authorizeRoles = (...roles) => {
  return authorize(...roles);
};

module.exports = { protect, authorize, authorizeRoles };