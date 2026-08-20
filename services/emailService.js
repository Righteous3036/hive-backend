// services/emailService.js
const sgMail = require('@sendgrid/mail');

const sendVerificationCode = async (email, code) => {
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to: email,
      from: process.env.SENDER_EMAIL || 'bidahoredem@gmail.com',
      subject: 'Your Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #00467F; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎓 Hive</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Campus Student Platform</p>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1a1a2e; margin-top: 0;">Email Verification</h2>
            <p style="color: #555; line-height: 1.6;">
              Your verification code is:
            </p>
            <div style="background: white; border: 2px dashed #00467F; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <h1 style="color: #00467F; font-size: 48px; letter-spacing: 12px; margin: 0;">${code}</h1>
              <p style="color: #888; font-size: 12px; margin: 8px 0 0;">Expires in 5 minutes</p>
            </div>
            <p style="color: #888; font-size: 13px; line-height: 1.6;">
              If you did not request this code, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
              © 2026 Hive · Campus Student Platform
            </p>
          </div>
        </div>
      `
    };
    
    await sgMail.send(msg);
    console.log('✅ Verification email sent to:', email);
    return { success: true };
    
  } catch (error) {
    console.error('❌ SendGrid error:', error.response?.body || error.message);
    throw new Error('Failed to send verification code');
  }
};

// Only export the functions you need
module.exports = { sendVerificationCode };