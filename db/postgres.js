
require('dotenv').config();

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in your .env file');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const db = {
  query: (text, params) => pool.query(text, params)
};

module.exports = {
  db,
  pool
};
