#!/usr/bin/env node
// Usage: node scripts/migrate.js scripts/migration_001_image_roles.sql
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/migrate.js <sql-file>');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  console.log(`Running ${file}...`);

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
