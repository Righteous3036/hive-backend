const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// ── GET MY PROFILE ──
router.get('/profile', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, student_id, department,
       level, bio, role, profile_color, profile_picture, 
       cover_photo, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── UPDATE PROFILE ──
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, department, level, bio, profile_color, profile_picture, cover_photo } = req.body;
    await db.query(
      `UPDATE users SET name=$1, email=$2, department=$3,
       level=$4, bio=$5, profile_color=$6, 
       profile_picture=$7, cover_photo=$8 WHERE id=$9`,
      [name, email, department, level, bio, profile_color,
        profile_picture || null, cover_photo || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated successfully!' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── CHANGE PASSWORD ──
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await db.query(
      'SELECT password FROM users WHERE id = $1',
      [req.user.id]
    );
    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );
    res.json({ success: true, message: 'Password changed successfully!' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET MY GROUPS ──
router.get('/my-groups', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, gm.role as my_role, gm.status as membership_status
       FROM group_members gm
       JOIN groups_table g ON gm.group_id = g.id
       WHERE gm.user_id = $1 AND gm.status IN ('approved', 'pending')
       ORDER BY gm.joined_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, groups: result.rows });
  } catch (error) {
    console.error('Get my groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── SAVE / UNSAVE GROUP ──
router.post('/saved/:groupId', auth, async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT id FROM saved_groups WHERE user_id = $1 AND group_id = $2',
      [req.user.id, req.params.groupId]
    );
    if (existing.rows.length > 0) {
      await db.query(
        'DELETE FROM saved_groups WHERE user_id = $1 AND group_id = $2',
        [req.user.id, req.params.groupId]
      );
      return res.json({ success: true, saved: false, message: 'Group unsaved' });
    }
    await db.query(
      'INSERT INTO saved_groups (user_id, group_id) VALUES ($1, $2)',
      [req.user.id, req.params.groupId]
    );
    res.json({ success: true, saved: true, message: 'Group saved!' });
  } catch (error) {
    console.error('Save group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET SAVED GROUPS ──
router.get('/saved', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, sg.saved_at
       FROM saved_groups sg
       JOIN groups_table g ON sg.group_id = g.id
       WHERE sg.user_id = $1
       ORDER BY sg.saved_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, groups: result.rows });
  } catch (error) {
    console.error('Get saved groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET ALL USERS (Admin) ──
router.get('/all', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, student_id, department,
       level, role, profile_color, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET ALL USERS (admin) ──
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, student_id, department,
       level, role, profile_color, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── SUSPEND / RESTORE USER ──
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [status === 'suspended' ? 'suspended' : 'student', req.params.id]
    );
    res.json({ success: true, message: `User ${status}` });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET ALL GROUPS (admin) ──
router.get('/all-groups', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, u.name as admin_name,
       COUNT(DISTINCT gm.id) as member_count
       FROM groups_table g
       LEFT JOIN users u ON g.created_by = u.id
       LEFT JOIN group_members gm ON g.id = gm.group_id
       AND gm.status = 'approved'
       GROUP BY g.id, u.name
       ORDER BY g.created_at DESC`
    );
    res.json({ success: true, groups: result.rows });
  } catch (error) {
    console.error('Get all groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE MY ACCOUNT ──
router.delete('/delete-account', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account',
      });
    }

    // Verify password first
    const userRes = await db.query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, userRes.rows[0].password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Please try again.',
      });
    }

    // Delete all user data
    await db.query('DELETE FROM messages WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM saved_groups WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM group_members WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM announcements WHERE user_id = $1', [userId]);

    // Delete groups created by this user
    const userGroups = await db.query(
      'SELECT id FROM groups_table WHERE created_by = $1', [userId]
    );
    for (const group of userGroups.rows) {
      await db.query('DELETE FROM messages WHERE group_id = $1', [group.id]);
      await db.query('DELETE FROM group_members WHERE group_id = $1', [group.id]);
      await db.query('DELETE FROM group_tags WHERE group_id = $1', [group.id]);
      await db.query('DELETE FROM announcements WHERE group_id = $1', [group.id]);
      await db.query('DELETE FROM notifications WHERE group_id = $1', [group.id]);
      await db.query('DELETE FROM saved_groups WHERE group_id = $1', [group.id]);
    }
    await db.query('DELETE FROM groups_table WHERE created_by = $1', [userId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;