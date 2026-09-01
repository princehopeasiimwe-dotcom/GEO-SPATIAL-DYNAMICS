const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  // Important for Supabase session pooler
  max: 5,

  // Close idle connections relatively quickly
  idleTimeoutMillis: 30000,

  // Don't wait forever for a connection
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  pool
};