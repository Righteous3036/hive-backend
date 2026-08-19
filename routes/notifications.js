const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// ── GET MY NOTIFICATIONS ──
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.*, g.name as group_name
       FROM notifications n
       LEFT JOIN groups_table g ON n.group_id = g.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET UNREAD COUNT ──
router.get('/unread-count', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ success: false, count: 0 });
  }
});

// ── MARK ONE AS READ ──
router.put('/:id/read', auth, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── MARK ALL AS READ ──
router.put('/read-all', auth, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE ONE ──
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;