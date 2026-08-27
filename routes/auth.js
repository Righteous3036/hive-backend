const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// ── LOGIN ROUTE ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Return user details (exclude password hash)
    const { password: _, ...userData } = user;
    res.json({
      success: true,
      message: 'Login successful',
      user: userData,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ── FORGOT PASSWORD — SEND OTP ──
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.query(
      'SELECT id, name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address',
      });
    }

    await db.query('DELETE FROM otp_codes WHERE email = $1', [email]);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'INSERT INTO otp_codes (email, otp, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    const { sendOTP } = require('../services/emailService');
    await sendOTP(email, otp, result.rows[0].name);

    res.json({ success: true, message: `Reset code sent to ${email}` });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reset code' });
  }
});

// ── VERIFY RESET OTP ──
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const result = await db.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp = $2
       AND expires_at > NOW() AND used = FALSE`,
      [email, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code',
      });
    }

    res.json({ success: true, message: 'Code verified successfully' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── RESET PASSWORD ──
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const otpResult = await db.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp = $2
       AND expires_at > NOW() AND used = FALSE`,
      [email, otp]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired code. Please start again.',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = $1 WHERE email = $2',
      [hashedPassword, email]
    );

    await db.query(
      'UPDATE otp_codes SET used = TRUE WHERE email = $1',
      [email]
    );

    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;