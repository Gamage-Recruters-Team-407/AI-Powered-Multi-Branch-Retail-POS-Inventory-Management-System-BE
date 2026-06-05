const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences
} = require('../controllers/NotificationController');

// In a real app, you would add an Auth Middleware here to verify JWT
// router.use(authMiddleware);

// Notification endpoints
router.get('/', getNotifications);
router.put('/read-all', markAllAsRead); // Put this before /:id/read to avoid route conflict
router.put('/:id/read', markAsRead);

// Preferences endpoints
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

module.exports = router;
