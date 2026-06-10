const express = require('express');
const {
  register,
  loginUser,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  logoutUser,
  changePassword,
  getSecurityStats,
  getRealAuditLogs
} = require('../controllers/authcontroller');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Public Routes
router.post('/register', register);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Private Authenticated Routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);
router.post('/logout', protect, logoutUser);

router.get('/audit/stats', protect, getSecurityStats);
router.get('/audit/logs', protect, getRealAuditLogs);

// Role Authorization Test Routes
router.get('/admin-data', protect, authorize('admin'), (req, res) => res.json({ message: 'Admin only' }));
router.get('/manager-data', protect, authorize('admin', 'manager'), (req, res) => res.json({ message: 'Manager data' }));

module.exports = router;