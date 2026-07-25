const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SecurityService = require("../services/securityService");

const normalizeRole = (role = "") =>
  String(role || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/^super_admin$|^superadmin$|^administrator$/, "admin");

const protect = async (req, res, next) => {
  let token;

  try {
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    if (decoded.sessionId) {
      const session = await SecurityService.validateSession(decoded.sessionId);

      if (!session) {
        return res.status(401).json({
          success: false,
          message: "Session expired or invalid",
        });
      }

      req.session = session;
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is disabled. Please contact admin.",
      });
    }

    // ✅ APPROVAL STATUS CHECK - 403 error එන්නේ මෙතනින්
    const approvalStatus = user.approvalStatus || "APPROVED";

    if (approvalStatus !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message:
          approvalStatus === "PENDING"
            ? "Your account is pending admin approval. Please wait for admin to approve your account."
            : "Your account registration was rejected. Please contact admin.",
        approvalStatus: approvalStatus,
      });
    }

    req.user = user;
    req.user.sessionId = decoded.sessionId || null;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Token invalid or expired",
    });
  }
};

const authorize = (...roles) => {
  const allowedRoles = roles.map((role) => normalizeRole(role));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userRole = normalizeRole(req.user.role);

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }

    next();
  };
};

const authorizeRoles = (...roles) => authorize(...roles);

module.exports = {
  protect,
  authorize,
  authorizeRoles,
};