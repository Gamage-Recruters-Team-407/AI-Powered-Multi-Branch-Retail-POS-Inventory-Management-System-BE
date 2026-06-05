const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const roleMap = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  cashier: 'CASHIER',
  employee: 'EMPLOYEE',
  super_admin: 'SUPER_ADMIN',
};

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

const buildUserResponse = (user) => ({
  id: user._id,
  name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
  email: user.email,
  role: user.role.toLowerCase(),
});

const isMongoConnected = () => mongoose.connection.readyState === 1;

const requireMongoConnection = (res) => {
  if (isMongoConnected()) return true;

  res.status(503).json({
    message: 'MongoDB is not connected yet. Check MONGO_URI, DB_NAME, and Atlas network access.',
  });
  return false;
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    if (!requireMongoConnection(res)) return;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const [firstName, ...restName] = name.trim().split(/\s+/);
    const user = await User.create({
      firstName,
      lastName: restName.join(' '),
      email: normalizedEmail,
      password,
      role: roleMap[String(role).toLowerCase()] || 'EMPLOYEE',
    });

    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user: buildUserResponse(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!requireMongoConnection(res)) return;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is disabled' });
    }

    res.json({
      success: true,
      token: generateToken(user._id),
      user: buildUserResponse(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!requireMongoConnection(res)) return;

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'No user with that email' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    await transporter.sendMail({
      from: `"POS System" <${process.env.EMAIL}>`,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">
          Reset Password
        </a>
        <p>This link expires in 30 minutes.</p>
        <p>If you did not request this, ignore this email.</p>
      `,
    });

    res.json({ success: true, message: 'Reset email sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  try {
    if (!requireMongoConnection(res)) return;

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    if (!requireMongoConnection(res)) return;

    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, user: buildUserResponse(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (!requireMongoConnection(res)) return;

    const { name, email, password } = req.body;
    const user = await User.findById(req.user.id);

    if (name) {
      const [firstName, ...restName] = name.trim().split(/\s+/);
      user.firstName = firstName;
      user.lastName = restName.join(' ');
    }
    if (email) user.email = email.trim().toLowerCase();
    if (password) user.password = password;

    await user.save();

    res.json({
      success: true,
      user: buildUserResponse(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
