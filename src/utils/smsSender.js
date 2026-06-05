const twilio = require('twilio');

// Initialize Twilio client using environment variables
// Note: If keys are missing, we gracefully mock the behavior to prevent crashes in dev
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn('[Twilio Config] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env. SMS will be mocked.');
}

const sendSMS = async (to, body) => {
  try {
    if (!client) {
      console.log(`[Mock SMS] Would have sent to ${to}: ${body}`);
      return true;
    }

    const message = await client.messages.create({
      body,
      from: fromPhone,
      to
    });

    console.log(`[Twilio SMS] Sent successfully: ${message.sid}`);
    return true;
  } catch (error) {
    console.error(`[Twilio Error] Failed to send SMS to ${to}:`, error.message);
    return false;
  }
};

module.exports = { sendSMS };
