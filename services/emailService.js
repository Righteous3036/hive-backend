const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Must be false for port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3',
  },
});

const sendOTP = async (email, otp, name) => {
  const mailOptions = {
    from: `"CampusGroupFinder" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your CampusGroupFinder Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        
        <div style="background: #00467F; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎓 CampusGroupFinder</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">University of Ghana</p>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Hi ${name}! 👋</h2>
          <p style="color: #555; line-height: 1.6;">
            Thank you for registering on CampusGroupFinder. 
            Use the verification code below to complete your registration.
          </p>

          <div style="background: white; border: 2px dashed #00467F; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <p style="color: #888; font-size: 14px; margin: 0 0 8px;">Your verification code</p>
            <h1 style="color: #00467F; font-size: 48px; letter-spacing: 12px; margin: 0;">${otp}</h1>
            <p style="color: #888; font-size: 12px; margin: 8px 0 0;">Expires in 10 minutes</p>
          </div>

          <p style="color: #888; font-size: 13px; line-height: 1.6;">
            If you did not request this code, please ignore this email.
            Do not share this code with anyone.
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
            © 2025 CampusGroupFinder · University of Ghana · Department of Computer Science
          </p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendOTP };