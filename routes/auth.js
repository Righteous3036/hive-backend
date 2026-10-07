const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendOTP } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'campusgroupfinder_secret_key_2025';

// ── SEND REGISTRATION OTP ──
router.post('/send-otp', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    await db.query('DELETE FROM otp_codes WHERE email = $1', [email]);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'INSERT INTO otp_codes (email, otp, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    await sendOTP(email, otp, name || 'User');

    res.json({
      success: true,
      message: `Verification code sent to ${email}`,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
    });
  }
});

// ── REGISTER USER ──
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, student_id, department, level, otp } = req.body;

    const otpResult = await db.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp = $2
       AND expires_at > NOW() AND used = FALSE`,
      [email, otp]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.query(
      `INSERT INTO users (email, password, name, student_id, department, level, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'student')
       RETURNING id, email, name, student_id, department, level, role`,
      [email, hashedPassword, name, student_id, department, level]
    );

    await db.query('UPDATE otp_codes SET used = TRUE WHERE email = $1', [email]);

    const user = newUser.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

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

    const { password: _, ...userData } = user;
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Login success for:', email, '| Token generated:', token ? 'YES' : 'NO');
    res.json({
      success: true,
      message: 'Login successful',
      token,
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