const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AuditService = require("../services/auditService"); // Security Audit සඳහා

// ── 1. PROTECT MIDDLEWARE (ලොග් වූ පරිශීලකයින් හඳුනා ගැනීම සහ ටෝකන් පරීක්ෂාව) ──
const protect = async (req, res, next) => {
  let token;

  // Header එකේ Bearer Token එකක් තියෙනවාද කියා බැලීම (පරණ කෝඩ් එකෙන්)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // ටෝකන් එකක් නැත්නම් අවසර නොදීම
  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }

  try {
    // ටෝකන් එක නිවැරදිද කියා සත්‍යාපනය කිරීම (Verify JWT)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // මුද්‍රිත මුරපදය (Password) හැර ඉතිරි දත්ත ලබා ගැනීම
    req.user = await User.findById(decoded.id).select("-password");

    // පරිශීලකයා පද්ධතියේ නොමැති නම් හෝ අක්‍රිය කර ඇත්නම් (පරණ කෝඩ් එකෙන්)
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: "Account disabled or user not found" });
    }

    next(); // ඊළඟ පියවරට යාමට අවසර දීම
  } catch (err) {
    // ටෝකන් එක වැරදි නම් හෝ කල් ඉකුත් වී ඇත්නම්
    return res.status(401).json({ success: false, message: "Token invalid or expired" });
  }
};

// ── 2. AUTHORIZE MIDDLEWARE (තනතුරු මට්ටම අනුව අවසර පරීක්ෂාව - RBAC) ──────────
const authorize = (...roles) => {
  return (req, res, next) => {
    // ලොග් වූ කෙනාගේ තනතුර (Role) අවසර දී ඇති ලැයිස්තුවේ නැත්නම් බ්ලොක් කිරීම
    if (!roles.includes(req.user.role)) {
      
      // ආරක්ෂක විගණන ලොග් එකක් තැබීම (Security Audit Log)
      if (typeof AuditService?.fromReq === 'function') {
        AuditService.fromReq(req, {
          action: "UNAUTHORIZED_ACCESS_ATTEMPT",
          module: "AUTH",
          status: "FAILURE",
          severity: "HIGH",
          metadata: { attemptedRole: req.user.role, requiredRoles: roles, url: req.originalUrl }
        }).catch(err => console.error("Audit error:", err.message));
      }

      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not allowed to access this resource`,
      });
    }
    next(); // අවසර තිබේ නම් ඉදිරියට යාමට දීම
  };
};

// පැරණි කේතයන්ගේ ගැළපුම සඳහා Exports (Backward Compatibility)
module.exports = { 
  protect, 
  authorize, 
  authorizeRoles: authorize // පරණ සමහර බ්‍රාන්ච් වල authorizeRoles ලෙස පාවිච්චි කර ඇති නිසා
};