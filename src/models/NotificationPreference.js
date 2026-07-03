const mongoose = require('mongoose');

const NotificationPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  emailEnabled: {
    type: Boolean,
    default: true
  },
  smsEnabled: {
    type: Boolean,
    default: false // Disabled by default to save cost, user must opt-in
  },
  inAppEnabled: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('NotificationPreference', NotificationPreferenceSchema);
