const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const AuditService = require("../services/auditService");
const SecurityService = require("../services/securityService");

// ── 1. JWT TOKEN GENERATOR ──────────────────────────────────────────────────
const generateToken = (userId, sessionId) => {
  return jwt.sign(
    { id: userId, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "24h" }
  );
};

// ── 2. EMAIL TRANSPORTER ────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

// ── 3. REGISTER FUNCTION ────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, email, password, role, branch } = req.body;

    const { valid, errors } = await SecurityService.validatePassword(password);
    if (!valid) {
      return res.status(400).json({ success: false, message: "Password policy violation.", errors });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const user = await User.create({ name, email, password, role, branch });
    const session = await SecurityService.createSession(user, req);
    const token = generateToken(user._id, session.sessionId);

    await AuditService.fromReq(req, {
      action: "USER_REGISTERED",
      module: "AUTH",
      status: "SUCCESS",
      severity: "MEDIUM",
      metadata: { registeredUserId: user._id, email: user.email, role: user.role }
    });

    res.status(201).json({
      success: true,
      token,
      sessionId: session.sessionId,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 4. LOGIN USER FUNCTION ──────────────────────────────────────────────────
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "unknown").split(",")[0].trim();

    const bruteCheck = await SecurityService.checkBruteForce(email, ip);
    if (bruteCheck.blocked) {
      await SecurityService.recordLoginAttempt({
        email, ipAddress: ip, userAgent: req.headers["user-agent"], success: false, failureReason: "ACCOUNT_LOCKED",
      });

      await AuditService.log({
        action: "ACCOUNT_LOCKED", module: "AUTH", req, status: "BLOCKED", severity: "HIGH",
        metadata: { email, reason: bruteCheck.reason, remainingMinutes: bruteCheck.remainingMinutes },
      });

      return res.status(429).json({ success: false, message: bruteCheck.reason, remainingMinutes: bruteCheck.remainingMinutes });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      await SecurityService.recordLoginAttempt({ email, ipAddress: ip, userAgent: req.headers["user-agent"], success: false, failureReason: "USER_NOT_FOUND" });
      await AuditService.log({ action: "LOGIN_FAILED", module: "AUTH", req, status: "FAILURE", severity: "MEDIUM", metadata: { email, reason: "USER_NOT_FOUND" } });
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    if (!user.isActive) {
      await SecurityService.recordLoginAttempt({ email, ipAddress: ip, userAgent: req.headers["user-agent"], success: false, failureReason: "ACCOUNT_DISABLED", userId: user._id });
      await AuditService.log({ user, action: "LOGIN_FAILED", module: "AUTH", req, status: "FAILURE", severity: "HIGH", metadata: { reason: "ACCOUNT_DISABLED" } });
      return res.status(401).json({ success: false, message: "Account is disabled." });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await SecurityService.recordLoginAttempt({ email, ipAddress: ip, userAgent: req.headers["user-agent"], success: false, failureReason: "INVALID_PASSWORD", userId: user._id });
      await AuditService.log({ user, action: "LOGIN_FAILED", module: "AUTH", req, status: "FAILURE", severity: "MEDIUM", metadata: { reason: "INVALID_PASSWORD" } });
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    // Create session
    const session = await SecurityService.createSession(user, req);
    const token = generateToken(user._id, session.sessionId);

    await SecurityService.recordLoginAttempt({ email, ipAddress: ip, userAgent: req.headers["user-agent"], success: true, userId: user._id });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    await AuditService.log({ user, action: "LOGIN", module: "AUTH", req, status: "SUCCESS", severity: "INFO", metadata: { lastLogin: user.lastLogin }, sessionId: session.sessionId });

    res.json({
      success: true,
      token,
      sessionId: session.sessionId,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, branch: user.branch, isActive: user.isActive },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
};

// ── 5. FORGOT PASSWORD FUNCTION ─────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "No user with that email" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await transporter.sendMail({
      from: `"POS System" <${process.env.EMAIL}>`,
      to: user.email,
      subject: "Password Reset Request",
      html: `<h2>Password Reset</h2><p>Click below to reset:</p><a href="${resetUrl}">Reset Password</a>`
    });

    res.json({ success: true, message: "Reset email sent" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 6. RESET PASSWORD FUNCTION ──────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 7. PROFILE MANAGEMENT FUNCTIONS ─────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.password) user.password = req.body.password;
    await user.save();
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 8. LOGOUT & PASSWORD CHANGE ─────────────────────────────────────────────
const logoutUser = async (req, res) => {
  try {
    const sessionId = req.user?.sessionId || req.body?.sessionId;
    if (sessionId) {
      await SecurityService.revokeSession(sessionId, "User logout");
    }
    await AuditService.fromReq(req, { action: "LOGOUT", module: "AUTH", status: "SUCCESS" });
    res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { valid, errors } = await SecurityService.validatePassword(newPassword);
    if (!valid) return res.status(400).json({ success: false, message: "Password issues.", errors });

    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, message: "Current password incorrect." });
    }

    user.password = newPassword;
    await user.save();
    
    await AuditService.fromReq(req, { action: "PASSWORD_CHANGE", module: "AUTH", status: "SUCCESS", severity: "MEDIUM" });
    
    res.json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 9. EXPORT ALL FUNCTIONS ─────────────────────────────────────────────────
module.exports = {
  register,
  loginUser,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  logoutUser,
  changePassword,
};