const axios = require('axios');

// Initialize Notify.lk using environment variables
// Note: If keys are missing, we gracefully mock the behavior to prevent crashes in dev
const userId = process.env.NOTIFY_USER_ID;
const apiKey = process.env.NOTIFY_API_KEY;
const senderId = process.env.NOTIFY_SENDER_ID;

const sendSMS = async (to, body) => {
  try {
    if (!userId || !apiKey || !senderId) {
      console.log(`[Mock SMS] Would have sent to ${to}: ${body}`);
      return true;
    }

    // Clean the phone number for Notify.lk (e.g. remove + sign)
    const cleanTo = to.replace('+', '');

    // Notify.lk GET API endpoint
    const url = `https://app.notify.lk/api/v1/send?user_id=${userId}&api_key=${apiKey}&sender_id=${senderId}&to=${cleanTo}&message=${encodeURIComponent(body)}`;

    const response = await axios.get(url);

    if (response.data && response.data.status === 'success') {
      console.log(`[Notify.lk SMS] Sent successfully to ${cleanTo}`);
      return true;
    } else {
      console.error(`[Notify.lk Error] Failed to send SMS to ${to}:`, response.data);
      return false;
    }
  } catch (error) {
    console.error(`[Notify.lk Error] Failed to send SMS to ${to}:`, error.message);
    return false;
  }
};

module.exports = { sendSMS };
