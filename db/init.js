const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('✓ Connected to Supabase PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Test the database connection.
 * The actual database tables already exist in Supabase,
 * so we do NOT recreate or seed them here.
 */
async function initDb() {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    console.log('✓ Supabase database connection verified:', result.rows[0].now);
  } catch (error) {
    console.error('✗ Failed to connect to Supabase:', error.message);
    throw error;
  }
}

module.exports = {
  db: pool,
  pool,
  initDb
};