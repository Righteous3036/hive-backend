const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendOTP } = require('../services/emailService');

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Validate email format
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Validate student ID — 8 to 10 digits only
const isValidStudentId = (id) => /^\d{8,10}$/.test(id);

// ── SEND OTP ──
router.post('/send-otp', async (req, res) => {
  try {
    const { email, name, student_id } = req.body;

    // Validate email
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    // Validate student ID
    if (!isValidStudentId(student_id)) {
      return res.status(400).json({
        success: false,
        message: 'Student ID must be 8 to 10 digits only',
      });
    }

    // Check if email already exists
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'This email is already registered',
      });
    }

    // Check if student ID already exists
    const existingId = await db.query(
      'SELECT id FROM users WHERE student_id = $1',
      [student_id]
    );
    if (existingId.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'This Student ID is already registered',
      });
    }

    // Delete any existing OTPs for this email
    await db.query('DELETE FROM otp_codes WHERE email = $1', [email]);

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await db.query(
      'INSERT INTO otp_codes (email, otp, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send OTP email
    await sendOTP(email, otp, name);

    res.json({
      success: true,
      message: `Verification code sent to ${email}`,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code. Please try again.',
    });
  }
});

// ── VERIFY OTP & REGISTER ──
router.post('/register', async (req, res) => {
  try {
    const { name, email, student_id, department, level, password, otp } = req.body;

    // Validate all fields
    if (!name || !email || !student_id || !department || !level || !password || !otp) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    if (!isValidStudentId(student_id)) {
      return res.status(400).json({
        success: false,
        message: 'Student ID must be 8 to 10 digits only',
      });
    }

    // Verify OTP
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

    // Mark OTP as used
    await db.query(
      'UPDATE otp_codes SET used = TRUE WHERE email = $1',
      [email]
    );

    // Check if already registered
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR student_id = $2',
      [email, student_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email or Student ID already registered',
      });
    }

    // Create account
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, student_id, department, level, password, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'student') RETURNING id`,
      [name, email, student_id, department, level, hashedPassword]
    );

    const userId = result.rows[0].id;
    const token = jwt.sign(
      { id: userId, email, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: userId, name, email,
        student_id, department, level, role: 'student',
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── LOGIN ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        student_id: user.student_id, department: user.department,
        level: user.level, role: user.role,
        profile_color: user.profile_color || '#00467F',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;