const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const User = require('../models/User');
const notificationQueue = require('../queues/notificationQueue');
const systemEvents = require('../events/eventBus');

const processAlert = async (data) => {
  // Now accepts target instead of just userId
  const { target, category = 'GENERAL', title, message, type = 'INFO', channels = ['in-app'], link } = data;

  try {
    // 1. Determine who to send this to based on the target
    let query = {};
    if (target && target.userId) {
      query._id = target.userId;
    } else if (target) {
      if (target.role) query.role = target.role.toUpperCase();
      if (target.roles && Array.isArray(target.roles)) {
        query.role = { $in: target.roles.map(r => r.toUpperCase()) };
      }
      if (target.branchId) query.branch = target.branchId; // Auth team used 'branch' in User.js
    }

    // Stop if no valid target was provided
    if (Object.keys(query).length === 0) {
      console.warn('Alert dismissed: No valid target provided (missing userId, role, or branchId)');
      return;
    }

    // 2. Fetch all matching users (REAL CONTACT INFO LOOKUP from User Model)
    const users = await User.find(query);

    if (users.length === 0) {
      console.log(`No users found matching target: ${JSON.stringify(target)}`);
      return;
    }

    // 3. Process the notification for each matching user
    for (const user of users) {
      const userId = user._id;

      // Fetch User Preferences (Defaults to all enabled if not found)
      let prefs = await NotificationPreference.findOne({ userId });
      if (!prefs) {
        prefs = { emailEnabled: true, smsEnabled: false, inAppEnabled: true };
      }

      // In-App Notification (Database + WebSocket)
      if (channels.includes('in-app') && prefs.inAppEnabled) {
        const newNotif = await Notification.create({
          user: userId,
          category,
          type,
          title,
          message,
          channels,
          link
        });

        // Emit to WebSocket room (notifications_userId)
        if (global.io) {
          global.io.to(`notifications_${userId.toString()}`).emit('new-notification', newNotif);
        }
      }

      // Email Notification (via Background Queue)
      if (channels.includes('email') && prefs.emailEnabled && user.email) {
        await notificationQueue.add('sendEmailJob', {
            type: 'EMAIL',
            recipient: user.email,
            content: { subject: title, text: message }
        });
      }

      // SMS Notification (via Background Queue)
      if (channels.includes('sms') && prefs.smsEnabled && user.phone) {
        await notificationQueue.add('sendSmsJob', {
            type: 'SMS',
            recipient: user.phone,
            content: { text: `${title} - ${message}` }
        });
      }
    }

  } catch (error) {
    console.error('Error processing alert:', error);
  }
};

// Listen to the central Event Bus
systemEvents.on('SEND_ALERT', processAlert);

module.exports = { processAlert };
