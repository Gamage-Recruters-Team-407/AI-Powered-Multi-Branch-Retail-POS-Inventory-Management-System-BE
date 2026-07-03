const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  getEmailLogs,
  sendSmsToSuppliers,
  sendSmsToWarehouses,
  sendNotificationsToSuppliers,
  sendNotificationsToEmployees,
  sendNotificationsToCustomers
} = require('../controllers/NotificationController');

const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
// Notification endpoints
router.get('/', getNotifications);
router.put('/read-all', markAllAsRead); // Put this before /:id/read to avoid route conflict
router.put('/:id/read', markAsRead);

// Preferences endpoints
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

// Email Logs endpoint
router.get('/emails', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), getEmailLogs);

// SMS & Multi-channel endpoints
router.post('/sms/suppliers', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), sendSmsToSuppliers);
router.post('/sms/warehouses', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), sendSmsToWarehouses);
router.post('/notify/suppliers', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), sendNotificationsToSuppliers);
router.post('/notify/employees', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), sendNotificationsToEmployees);
router.post('/notify/customers', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), sendNotificationsToCustomers);

module.exports = router;
