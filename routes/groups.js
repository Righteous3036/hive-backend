const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// ── GET ALL GROUPS ──
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, u.name as creator_name,
       COUNT(DISTINCT CASE WHEN gm.status = 'approved' THEN gm.id END) as member_count
       FROM groups_table g
       LEFT JOIN users u ON g.created_by = u.id
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.status = 'active'
       GROUP BY g.id, u.name
       ORDER BY g.created_at DESC`
    );
    const groups = result.rows;
    for (let group of groups) {
      const tags = await db.query(
        'SELECT tag FROM group_tags WHERE group_id = $1', [group.id]
      );
      group.tags = tags.rows.map(t => t.tag);
    }
    res.json({ success: true, groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET ALL GROUPS (Admin) ──
router.get('/all', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, u.name as creator_name,
       COUNT(DISTINCT CASE WHEN gm.status = 'approved' THEN gm.id END) as member_count
       FROM groups_table g
       LEFT JOIN users u ON g.created_by = u.id
       LEFT JOIN group_members gm ON g.id = gm.group_id
       GROUP BY g.id, u.name
       ORDER BY g.created_at DESC`
    );
    res.json({ success: true, groups: result.rows });
  } catch (error) {
    console.error('Get all groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── CREATE GROUP ──
router.post('/', auth, async (req, res) => {
  try {
    const {
      name, description, category, icon, color,
      location, meeting_time, meeting_frequency,
      max_members, is_private, require_approval, tags,
    } = req.body;

    const result = await db.query(
      `INSERT INTO groups_table
       (name, description, category, icon, color, location,
        meeting_time, meeting_frequency, max_members,
        is_private, require_approval, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
       RETURNING id`,
      [name, description, category, icon, color, location,
       meeting_time, meeting_frequency, max_members,
       is_private, require_approval, req.user.id]
    );

    const groupId = result.rows[0].id;

    if (tags && tags.length > 0) {
      for (const tag of tags) {
        await db.query(
          'INSERT INTO group_tags (group_id, tag) VALUES ($1, $2)',
          [groupId, tag]
        );
      }
    }

    // Creator is automatically admin member
    await db.query(
      `INSERT INTO group_members (group_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'approved')`,
      [groupId, req.user.id]
    );

    res.status(201).json({ success: true, message: 'Group created!', groupId });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET SINGLE GROUP ──
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, u.name as creator_name,
       COUNT(DISTINCT CASE WHEN gm.status = 'approved' THEN gm.id END) as member_count
       FROM groups_table g
       LEFT JOIN users u ON g.created_by = u.id
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.id = $1
       GROUP BY g.id, u.name`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const group = result.rows[0];
    const tags = await db.query(
      'SELECT tag FROM group_tags WHERE group_id = $1', [group.id]
    );
    group.tags = tags.rows.map(t => t.tag);

    res.json({ success: true, group });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET GROUP MEMBERS ──
router.get('/:id/members', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id as user_id, u.name, u.email, u.department,
       u.level, u.profile_color, u.profile_picture,
       gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1 AND gm.status = 'approved'
       ORDER BY
         CASE gm.role
           WHEN 'admin' THEN 1
           WHEN 'moderator' THEN 2
           ELSE 3
         END, gm.joined_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, members: result.rows });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET GROUP ANNOUNCEMENTS ──
router.get('/:id/announcements', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.name as author_name
       FROM announcements a
       JOIN users u ON a.user_id = u.id
       WHERE a.group_id = $1
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, announcements: result.rows });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── CHECK MEMBERSHIP ──
router.get('/:id/membership', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT role, status FROM group_members
       WHERE group_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.json({ success: true, isMember: false, isPending: false, role: null });
    }
    const { role, status } = result.rows[0];
    res.json({
      success: true,
      isMember: status === 'approved',
      isPending: status === 'pending',
      role: status === 'approved' ? role : null,
    });
  } catch (error) {
    console.error('Membership check error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── TOGGLE JOIN / LEAVE ──
router.post('/:id/toggle-join', auth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Check if creator
    const groupResult = await db.query(
      'SELECT created_by, require_approval, name FROM groups_table WHERE id = $1',
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const { created_by, require_approval, name: groupName } = groupResult.rows[0];

    if (created_by === userId) {
      return res.status(400).json({
        success: false,
        message: 'You are the group creator and cannot leave',
      });
    }

    const existing = await db.query(
      'SELECT id, status FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );

    if (existing.rows.length > 0) {
      // Leave group
      await db.query(
        'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, userId]
      );
      return res.json({ success: true, joined: false, message: 'Left group successfully' });
    }

    // Join group
    const status = require_approval ? 'pending' : 'approved';
    await db.query(
      'INSERT INTO group_members (group_id, user_id, status) VALUES ($1, $2, $3)',
      [groupId, userId, status]
    );

    // Get requester name
    const requesterRes = await db.query(
      'SELECT name FROM users WHERE id = $1',
      [userId]
    );
    const requesterName = requesterRes.rows[0]?.name || 'A student';

    if (status === 'pending') {
      // Notify group creator about join request
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, group_id)
         VALUES ($1, 'join_request', $2, $3, $4)`,
        [
          created_by,
          '👋 New Join Request',
          `${requesterName} wants to join your group "${groupName}". Tap to review.`,
          groupId,
        ]
      );
    } else {
      // Auto approved — notify the joiner
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, group_id)
         VALUES ($1, 'join_approved', $2, $3, $4)`,
        [
          userId,
          '🎉 Joined Successfully!',
          `You have joined "${groupName}". Welcome to the group!`,
          groupId,
        ]
      );
    }

    res.json({
      success: true,
      joined: status === 'approved',
      status,
      message: status === 'pending' ? 'Join request sent!' : 'Joined successfully!',
    });
  } catch (error) {
    console.error('Toggle join error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET JOIN REQUESTS ──
router.get('/:id/join-requests', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id as user_id, u.name, u.email,
       u.department, u.level, u.profile_color
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1 AND gm.status = 'pending'`,
      [req.params.id]
    );
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    console.error('Join requests error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── APPROVE MEMBER ──
router.put('/:id/members/:userId/approve', auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE group_members SET status = 'approved'
       WHERE group_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );

    // Send notification
    const groupResult = await db.query(
      'SELECT name FROM groups_table WHERE id = $1', [req.params.id]
    );
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, group_id)
       VALUES ($1, 'join_approved', $2, $3, $4)`,
      [
        req.params.userId,
        'Join Request Approved! 🎉',
        `Your request to join ${groupResult.rows[0]?.name} has been approved. Welcome!`,
        req.params.id,
      ]
    );

    res.json({ success: true, message: 'Member approved' });
  } catch (error) {
    console.error('Approve member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── REJECT MEMBER ──
router.put('/:id/members/:userId/reject', auth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    res.json({ success: true, message: 'Member rejected' });
  } catch (error) {
    console.error('Reject member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── REMOVE MEMBER (admin removes a member) ──
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const { id: groupId, userId } = req.params;

    // Check requester is admin
    const adminCheck = await db.query(
      `SELECT role FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`,
      [groupId, req.user.id]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can remove members' });
    }

    await db.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE GROUP (creator only) ──
router.delete('/:id', auth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    const result = await db.query(
      'SELECT created_by FROM groups_table WHERE id = $1', [groupId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    if (result.rows[0].created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the group creator can delete this group',
      });
    }

    await db.query('DELETE FROM group_tags WHERE group_id = $1', [groupId]);
    await db.query('DELETE FROM group_members WHERE group_id = $1', [groupId]);
    await db.query('DELETE FROM announcements WHERE group_id = $1', [groupId]);
    await db.query('DELETE FROM notifications WHERE group_id = $1', [groupId]);
    await db.query('DELETE FROM saved_groups WHERE group_id = $1', [groupId]);
    await db.query('DELETE FROM groups_table WHERE id = $1', [groupId]);

    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── APPROVE GROUP ──
router.put('/:id/approve', auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE groups_table SET status = 'active' WHERE id = $1`,
      [req.params.id]
    );

    // Notify the group creator
    const groupRes = await db.query(
      `SELECT g.name, g.created_by FROM groups_table g WHERE g.id = $1`,
      [req.params.id]
    );

    if (groupRes.rows.length > 0) {
      const { name, created_by } = groupRes.rows[0];
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, group_id)
         VALUES ($1, 'join_approved', $2, $3, $4)`,
        [
          created_by,
          '🎉 Group Approved!',
          `Your group "${name}" has been approved and is now live for all students to see!`,
          req.params.id,
        ]
      );
    }

    res.json({ success: true, message: 'Group approved' });
  } catch (error) {
    console.error('Approve group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── REJECT GROUP ──
router.put('/:id/reject', auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE groups_table SET status = 'rejected' WHERE id = $1`,
      [req.params.id]
    );

    // Notify the group creator
    const groupRes = await db.query(
      `SELECT g.name, g.created_by FROM groups_table g WHERE g.id = $1`,
      [req.params.id]
    );

    if (groupRes.rows.length > 0) {
      const { name, created_by } = groupRes.rows[0];
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, group_id)
         VALUES ($1, 'announcement', $2, $3, $4)`,
        [
          created_by,
          '❌ Group Not Approved',
          `Your group "${name}" was not approved. Please contact the admin for more information.`,
          req.params.id,
        ]
      );
    }

    res.json({ success: true, message: 'Group rejected' });
  } catch (error) {
    console.error('Reject group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── UPDATE GROUP STATUS ──
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query(
      'UPDATE groups_table SET status = $1 WHERE id = $2',
      [status, req.params.id]
    );
    res.json({ success: true, message: `Group ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET MESSAGES ──
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const memberCheck = await db.query(
      `SELECT id FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`,
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Members only' });
    }

    const { since } = req.query;
    let query = `
      SELECT m.id, m.content, m.created_at, m.reply_to_id,
             u.id as user_id, u.name, u.profile_color, u.profile_picture,
             rm.content as reply_content,
             ru.name as reply_sender_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN messages rm ON m.reply_to_id = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      WHERE m.group_id = $1
    `;
    const params = [req.params.id];
    if (since) {
      query += ` AND m.created_at > $2`;
      params.push(since);
    }
    query += ` ORDER BY m.created_at ASC LIMIT 100`;

    const result = await db.query(query, params);
    res.json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── SEND MESSAGE ──
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content, reply_to_id } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty' });
    }

    const memberCheck = await db.query(
      `SELECT id FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`,
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Members only' });
    }

    const result = await db.query(
      `INSERT INTO messages (group_id, user_id, content, reply_to_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content, created_at, reply_to_id`,
      [req.params.id, req.user.id, content.trim(), reply_to_id || null]
    );

    const msg = result.rows[0];
    const userRes = await db.query(
      `SELECT id as user_id, name, profile_color, profile_picture
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    let reply_content = null;
    let reply_sender_name = null;
    if (reply_to_id) {
      const replyRes = await db.query(
        `SELECT m.content, u.name
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.id = $1`,
        [reply_to_id]
      );
      if (replyRes.rows.length > 0) {
        reply_content = replyRes.rows[0].content;
        reply_sender_name = replyRes.rows[0].name;
      }
    }

    res.json({
      success: true,
      message: {
        ...msg,
        ...userRes.rows[0],
        reply_content,
        reply_sender_name,
      },
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── CLEAR ALL MESSAGES — MUST BE BEFORE /:messageId ──
router.delete('/:id/messages/clear-all', auth, async (req, res) => {
  try {
    const adminCheck = await db.query(
      `SELECT role FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`,
      [req.params.id, req.user.id]
    );
    if (adminCheck.rows[0]?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    await db.query('DELETE FROM messages WHERE group_id = $1', [req.params.id]);
    res.json({ success: true, message: 'Chat cleared' });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE SINGLE MESSAGE — MUST BE AFTER clear-all ──
router.delete('/:id/messages/:messageId', auth, async (req, res) => {
  try {
    const { id, messageId } = req.params;

    const msgRes = await db.query(
      'SELECT user_id FROM messages WHERE id = $1 AND group_id = $2',
      [messageId, id]
    );
    if (msgRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const adminCheck = await db.query(
      `SELECT role FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`,
      [id, req.user.id]
    );

    const isOwner = Number(msgRes.rows[0].user_id) === Number(req.user.id);
    const isAdmin = adminCheck.rows[0]?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    await db.query('DELETE FROM messages WHERE id = $1', [messageId]);
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET UNREAD MESSAGE COUNT PER GROUP ──
router.get('/:id/messages/unread-count', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { last_read } = req.query;

    const memberCheck = await db.query(
      `SELECT id FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`,
      [id, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    let query = `
      SELECT COUNT(*) as count FROM messages
      WHERE group_id = $1 AND user_id != $2
    `;
    const params = [id, req.user.id];

    if (last_read) {
      query += ` AND created_at > $3`;
      params.push(last_read);
    }

    const result = await db.query(query, params);
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ success: false, count: 0 });
  }
});

module.exports = router;