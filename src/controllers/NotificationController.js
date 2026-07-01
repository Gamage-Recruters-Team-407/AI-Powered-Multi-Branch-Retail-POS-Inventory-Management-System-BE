const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const EmailLog = require('../models/EmailLog');
const SmsLog = require('../models/SmsLog');
const Supplier = require('../models/Supplier');
const Warehouse = require('../models/Warehouse');
const Employee = require('../models/Employee');
const Customer = require('../models/Customer');
const { sendSMS } = require('../utils/smsSender');
const { sendEmail } = require('../utils/emailSender');

// ==========================================
// Constants
// ==========================================
const MAX_MESSAGE_LENGTH = 1000;
const MAX_SUBJECT_LENGTH = 200;

// ==========================================
// Helper: Sanitize user input
// ==========================================
const sanitizeInput = (text) => {
  if (!text) return '';
  // Strip script tags to prevent stored XSS in email bodies
  return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

// ==========================================
// Notification CRUD
// ==========================================

// Get all notifications for the logged-in user
const getNotifications = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark a specific notification as read (with ownership check)
const markAsRead = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // M6 Fix: Ownership check — only the owner can mark their own notification
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { isRead: true },
      { returnDocument: 'after' }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found or access denied' });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark all notifications as read for a user
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// Preferences
// ==========================================

const getPreferences = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.query.userId;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    let prefs = await NotificationPreference.findOne({ userId });
    if (!prefs) {
      prefs = { userId, emailEnabled: true, smsEnabled: false, inAppEnabled: true };
    }
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.body.userId;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const { emailEnabled, smsEnabled, inAppEnabled } = req.body;

    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId },
      { emailEnabled, smsEnabled, inAppEnabled },
      { returnDocument: 'after', upsert: true }
    );
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// Email Logs (with pagination)
// ==========================================

const getEmailLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const logs = await EmailLog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// Generic Multi-Channel Broadcast Dispatcher
// (C1 Fix: Eliminates the DRY violation)
// ==========================================

/**
 * Generic function to send SMS and/or Email to a list of recipients.
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} config
 * @param {Model}  config.Model - Mongoose model (Supplier, Employee, Customer, etc.)
 * @param {string} config.idField - The key in req.body containing the array of IDs
 * @param {string} config.recipientType - 'Supplier' | 'Employee' | 'Customer' | 'Warehouse'
 * @param {Function} config.getPhone - (doc) => phone string
 * @param {Function} config.getEmail - (doc) => email string
 */
const sendNotificationsToRecipients = async (req, res, config) => {
  try {
    const { Model, idField, recipientType, getPhone, getEmail } = config;
    const ids = req.body[idField];
    const { message, subject, sendSms, sendEmail: shouldSendEmail } = req.body;

    // --- Validation ---
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: `${recipientType} IDs are required` });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // H3 Fix: Input length validation
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    }

    if (!sendSms && !shouldSendEmail) {
      return res.status(400).json({ error: 'Must select at least one channel (SMS or Email)' });
    }

    if (shouldSendEmail && !subject) {
      return res.status(400).json({ error: 'Subject is required for Email' });
    }

    if (shouldSendEmail && subject && subject.length > MAX_SUBJECT_LENGTH) {
      return res.status(400).json({ error: `Subject too long (max ${MAX_SUBJECT_LENGTH} characters)` });
    }

    // H3 Fix: Sanitize input
    const cleanMessage = sanitizeInput(message);
    const cleanSubject = subject ? sanitizeInput(subject) : '';

    // --- Fetch recipients ---
    const recipients = await Model.find({ _id: { $in: ids } });
    if (recipients.length === 0) {
      return res.status(404).json({ error: `No matching ${recipientType.toLowerCase()}s found` });
    }

    // M3 Fix: Parallel dispatch with Promise.allSettled
    const dispatchPromises = recipients.map(async (recipient) => {
      const resultObj = { recipientId: recipient._id, smsStatus: 'Not Sent', emailStatus: 'Not Sent' };
      const phone = getPhone(recipient);
      const email = getEmail(recipient);

      // Handle SMS
      if (sendSms) {
        if (!phone) {
          resultObj.smsStatus = 'Failed: No phone';
        } else {
          const smsSuccess = await sendSMS(phone, cleanMessage);
          const status = smsSuccess ? 'Sent' : 'Failed';
          const errorMessage = smsSuccess ? '' : 'Failed to send SMS via provider';

          // C3 Fix: Use generic recipientId + recipientType
          await SmsLog.create({
            recipientId: recipient._id,
            recipientType,
            recipientPhone: phone,
            message: cleanMessage,
            status,
            errorMessage
          });
          resultObj.smsStatus = status;
        }
      }

      // Handle Email
      if (shouldSendEmail) {
        if (!email) {
          resultObj.emailStatus = 'Failed: No email';
        } else {
          try {
            await sendEmail(email, cleanSubject, cleanMessage);
            resultObj.emailStatus = 'Sent';
          } catch (err) {
            resultObj.emailStatus = 'Failed';
          }
        }
      }

      return resultObj;
    });

    const results = await Promise.allSettled(dispatchPromises);
    const finalResults = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });

    res.json({ success: true, message: 'Notification dispatch process completed', results: finalResults });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// Entity-specific wrappers (C1 Fix: One-liners)
// ==========================================

const sendNotificationsToSuppliers = (req, res) =>
  sendNotificationsToRecipients(req, res, {
    Model: Supplier,
    idField: 'supplierIds',
    recipientType: 'Supplier',
    getPhone: (s) => s.phone,
    getEmail: (s) => s.email
  });

const sendNotificationsToEmployees = (req, res) =>
  sendNotificationsToRecipients(req, res, {
    Model: Employee,
    idField: 'employeeIds',
    recipientType: 'Employee',
    getPhone: (e) => e.phone,
    getEmail: (e) => e.email
  });

const sendNotificationsToCustomers = (req, res) =>
  sendNotificationsToRecipients(req, res, {
    Model: Customer,
    idField: 'customerIds',
    recipientType: 'Customer',
    getPhone: (c) => c.phone,
    getEmail: (c) => c.email
  });

const sendNotificationsToWarehouses = (req, res) =>
  sendNotificationsToRecipients(req, res, {
    Model: Warehouse,
    idField: 'warehouseIds',
    recipientType: 'Warehouse',
    getPhone: (w) => w.phone,
    getEmail: (w) => w.email
  });

// ==========================================
// Exports
// ==========================================

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  getEmailLogs,
  sendNotificationsToSuppliers,
  sendNotificationsToEmployees,
  sendNotificationsToCustomers,
  sendNotificationsToWarehouses
};
