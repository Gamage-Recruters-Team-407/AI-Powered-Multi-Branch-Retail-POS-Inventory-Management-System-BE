const nodemailer = require('nodemailer');

// Configure your SMTP transporter here
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your_email@example.com',
    pass: process.env.SMTP_PASS || 'your_password'
  }
});

const sendEmail = async (to, subject, text, html = '') => {
  try {
    // If SMTP credentials are not set up, gracefully mock the email to prevent server crashes
    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your_email@gmail.com') {
      console.log(`[Mock Email Module] Would have sent to ${to}: ${subject}`);
      return true;
    }

    const info = await transporter.sendMail({
      from: `"Retail POS System" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: html || text
    });
    console.log(`[Email Module] Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[Email Error] Failed to send email to ${to}:`, error.message);
    return false;
  }
};

module.exports = { sendEmail };
