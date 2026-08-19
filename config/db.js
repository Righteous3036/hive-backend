const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  console.log('✅ Connected to Supabase database!');
  release();
});

module.exports = pool;