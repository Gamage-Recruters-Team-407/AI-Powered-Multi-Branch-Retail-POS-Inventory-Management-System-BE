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
      { returnDocument: 'after' }
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
      { returnDocument: 'after', upsert: true } // Create if doesn't exist
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

// Send SMS to selected suppliers
const sendSmsToSuppliers = async (req, res) => {
  try {
    const { supplierIds, message } = req.body;

    if (!supplierIds || !Array.isArray(supplierIds) || supplierIds.length === 0) {
      return res.status(400).json({ error: 'Supplier IDs are required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const suppliers = await Supplier.find({ _id: { $in: supplierIds } });
    if (suppliers.length === 0) {
      return res.status(404).json({ error: 'No matching suppliers found' });
    }

    const results = [];
    
    for (const supplier of suppliers) {
      if (!supplier.phone) {
        results.push({ supplierId: supplier._id, status: 'Failed', error: 'No phone number available' });
        continue;
      }

      const success = await sendSMS(supplier.phone, message);
      
      const status = success ? 'Sent' : 'Failed';
      const errorMessage = success ? '' : 'Failed to send SMS via SMS Provider';
      
      await SmsLog.create({
        supplierId: supplier._id,
        recipientPhone: supplier.phone,
        message,
        status,
        errorMessage
      });

      results.push({ supplierId: supplier._id, status });
    }

    res.json({ success: true, message: 'SMS dispatch process completed', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Send SMS to selected warehouses
const sendSmsToWarehouses = async (req, res) => {
  try {
    const { warehouseIds, message } = req.body;

    if (!warehouseIds || !Array.isArray(warehouseIds) || warehouseIds.length === 0) {
      return res.status(400).json({ error: 'Warehouse IDs are required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } });
    if (warehouses.length === 0) {
      return res.status(404).json({ error: 'No matching warehouses found' });
    }

    const results = [];
    
    for (const warehouse of warehouses) {
      if (!warehouse.phone) {
        results.push({ warehouseId: warehouse._id, status: 'Failed', error: 'No phone number available' });
        continue;
      }

      const success = await sendSMS(warehouse.phone, message);
      
      const status = success ? 'Sent' : 'Failed';
      const errorMessage = success ? '' : 'Failed to send SMS via SMS Provider';
      
      await SmsLog.create({
        warehouseId: warehouse._id,
        recipientPhone: warehouse.phone,
        message,
        status,
        errorMessage
      });

      results.push({ warehouseId: warehouse._id, status, error: errorMessage });
    }

    res.json({ success: true, message: 'SMS dispatch process completed', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Send SMS and/or Email to selected suppliers
const sendNotificationsToSuppliers = async (req, res) => {
  try {
    const { supplierIds, message, subject, sendSms, sendEmail: shouldSendEmail } = req.body;

    if (!supplierIds || !Array.isArray(supplierIds) || supplierIds.length === 0) {
      return res.status(400).json({ error: 'Supplier IDs are required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    if (!sendSms && !shouldSendEmail) {
      return res.status(400).json({ error: 'Must select at least one channel (SMS or Email)' });
    }
    
    if (shouldSendEmail && !subject) {
      return res.status(400).json({ error: 'Subject is required for Email' });
    }

    const suppliers = await Supplier.find({ _id: { $in: supplierIds } });
    if (suppliers.length === 0) {
      return res.status(404).json({ error: 'No matching suppliers found' });
    }

    const results = [];
    
    for (const supplier of suppliers) {
      const resultObj = { supplierId: supplier._id, smsStatus: 'Not Sent', emailStatus: 'Not Sent' };
      
      // Handle SMS
      if (sendSms) {
        if (!supplier.phone) {
          resultObj.smsStatus = 'Failed: No phone';
        } else {
          const smsSuccess = await sendSMS(supplier.phone, message);
          const status = smsSuccess ? 'Sent' : 'Failed';
          const errorMessage = smsSuccess ? '' : 'Failed to send SMS via provider';
          
          await SmsLog.create({
            supplierId: supplier._id,
            recipientPhone: supplier.phone,
            message,
            status,
            errorMessage
          });
          resultObj.smsStatus = status;
        }
      }
      
      // Handle Email
      if (shouldSendEmail) {
        if (!supplier.email) {
          resultObj.emailStatus = 'Failed: No email';
        } else {
          try {
            await sendEmail(supplier.email, subject, message);
            resultObj.emailStatus = 'Sent';
          } catch (err) {
            resultObj.emailStatus = 'Failed';
          }
        }
      }

      results.push(resultObj);
    }

    res.json({ success: true, message: 'Notification dispatch process completed', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Send SMS and/or Email to selected employees
const sendNotificationsToEmployees = async (req, res) => {
  try {
    const { employeeIds, message, subject, sendSms, sendEmail: shouldSendEmail } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ error: 'Employee IDs are required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    if (!sendSms && !shouldSendEmail) {
      return res.status(400).json({ error: 'Must select at least one channel (SMS or Email)' });
    }
    
    if (shouldSendEmail && !subject) {
      return res.status(400).json({ error: 'Subject is required for Email' });
    }

    const employees = await Employee.find({ _id: { $in: employeeIds } });
    if (employees.length === 0) {
      return res.status(404).json({ error: 'No matching employees found' });
    }

    const results = [];
    
    for (const employee of employees) {
      const resultObj = { employeeId: employee._id, smsStatus: 'Not Sent', emailStatus: 'Not Sent' };
      
      // Handle SMS
      if (sendSms) {
        if (!employee.phone) {
          resultObj.smsStatus = 'Failed: No phone';
        } else {
          const smsSuccess = await sendSMS(employee.phone, message);
          const status = smsSuccess ? 'Sent' : 'Failed';
          const errorMessage = smsSuccess ? '' : 'Failed to send SMS via provider';
          
          await SmsLog.create({
            supplierId: employee._id, // Repurposing supplierId field in SmsLog temporarily, or better use a generic target ID if needed
            recipientPhone: employee.phone,
            message,
            status,
            errorMessage
          });
          resultObj.smsStatus = status;
        }
      }
      
      // Handle Email
      if (shouldSendEmail) {
        if (!employee.email) {
          resultObj.emailStatus = 'Failed: No email';
        } else {
          try {
            await sendEmail(employee.email, subject, message);
            resultObj.emailStatus = 'Sent';
          } catch (err) {
            resultObj.emailStatus = 'Failed';
          }
        }
      }

      results.push(resultObj);
    }

    res.json({ success: true, message: 'Notification dispatch process completed', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Send SMS and/or Email to selected customers
const sendNotificationsToCustomers = async (req, res) => {
  try {
    const { customerIds, message, subject, sendSms, sendEmail: shouldSendEmail } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: 'Customer IDs are required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    if (!sendSms && !shouldSendEmail) {
      return res.status(400).json({ error: 'Must select at least one channel (SMS or Email)' });
    }
    
    if (shouldSendEmail && !subject) {
      return res.status(400).json({ error: 'Subject is required for Email' });
    }

    const customers = await Customer.find({ _id: { $in: customerIds } });
    if (customers.length === 0) {
      return res.status(404).json({ error: 'No matching customers found' });
    }

    const results = [];
    
    for (const customer of customers) {
      const resultObj = { customerId: customer._id, smsStatus: 'Not Sent', emailStatus: 'Not Sent' };
      
      // Handle SMS
      if (sendSms) {
        if (!customer.phone) {
          resultObj.smsStatus = 'Failed: No phone';
        } else {
          const smsSuccess = await sendSMS(customer.phone, message);
          const status = smsSuccess ? 'Sent' : 'Failed';
          const errorMessage = smsSuccess ? '' : 'Failed to send SMS via provider';
          
          await SmsLog.create({
            recipientPhone: customer.phone,
            message,
            status,
            errorMessage
          });
          resultObj.smsStatus = status;
        }
      }
      
      // Handle Email
      if (shouldSendEmail) {
        if (!customer.email) {
          resultObj.emailStatus = 'Failed: No email';
        } else {
          try {
            await sendEmail(customer.email, subject, message);
            resultObj.emailStatus = 'Sent';
          } catch (err) {
            resultObj.emailStatus = 'Failed';
          }
        }
      }

      results.push(resultObj);
    }

    res.json({ success: true, message: 'Notification dispatch process completed', results });
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
  getEmailLogs,
  sendSmsToSuppliers,
  sendSmsToWarehouses,
  sendNotificationsToSuppliers,
  sendNotificationsToEmployees,
  sendNotificationsToCustomers
};
