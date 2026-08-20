const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const db = require('./config/db');
const auth = require('./middleware/auth');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
const authRoutes         = require('./routes/auth');
const groupRoutes        = require('./routes/groups');
const userRoutes         = require('./routes/users');
const notificationRoutes = require('./routes/notifications');

app.use('/api/auth',          authRoutes);
app.use('/api/groups',        groupRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/notifications', notificationRoutes);

// ── STATS ──
app.get('/api/stats', auth, async (req, res) => {
  try {
    const [usersRes, totalRes, activeRes, pendingRes, membersRes] = await Promise.all([
      db.query(`SELECT COUNT(*) as count FROM users WHERE role = 'student'`),
      db.query(`SELECT COUNT(*) as count FROM groups_table`),
      db.query(`SELECT COUNT(*) as count FROM groups_table WHERE status = 'active'`),
      db.query(`SELECT COUNT(*) as count FROM groups_table WHERE status = 'pending'`),
      db.query(`SELECT COUNT(*) as count FROM group_members WHERE status = 'approved'`),
    ]);

    res.json({
      success: true,
      stats: {
        total_users:    parseInt(usersRes.rows[0].count),
        total_groups:   parseInt(totalRes.rows[0].count),
        active_groups:  parseInt(activeRes.rows[0].count),
        pending_groups: parseInt(pendingRes.rows[0].count),
        total_members:  parseInt(membersRes.rows[0].count),
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send('🐝 Hive API is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});