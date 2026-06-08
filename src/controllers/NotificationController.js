const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const EmailLog = require('../models/EmailLog');

// Get all notifications for the logged-in user
const getNotifications = async (req, res) => {
  try {
    // Note: Assuming `req.user._id` is populated by your Auth middleware.
    // For testing without auth middleware, you might need to pass userId in query params
    const userId = req.user ? req.user._id : req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50); // Get latest 50
      
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark a specific notification as read
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
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

// Get user preferences
const getPreferences = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.query.userId;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    let prefs = await NotificationPreference.findOne({ userId });
    if (!prefs) {
      // Return default preferences if none explicitly set
      prefs = { userId, emailEnabled: true, smsEnabled: false, inAppEnabled: true };
    }
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update user preferences
const updatePreferences = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.body.userId;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const { emailEnabled, smsEnabled, inAppEnabled } = req.body;

    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId },
      { emailEnabled, smsEnabled, inAppEnabled },
      { new: true, upsert: true } // Create if doesn't exist
    );
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get email logs
const getEmailLogs = async (req, res) => {
  try {
    const logs = await EmailLog.find({})
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  getEmailLogs
};
