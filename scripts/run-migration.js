#!/usr/bin/env node
/**
 * Run Database Migration
 * 
 * Executes a migration SQL file against the database.
 * 
 * Usage:
 *   node scripts/run-migration.js <migration-file>
 * 
 * Example:
 *   node scripts/run-migration.js lib/db/migrations/001_add_users_table.sql
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function runMigration(migrationFile) {
  try {
    console.log('🚀 Running migration...\n');
    
    // Check required env vars
    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:', missing.join(', '));
      console.error('   Make sure .env.local file exists with all DB_* variables');
      process.exit(1);
    }
    
    // Read migration file
    const migrationPath = path.join(process.cwd(), migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    console.log(`📄 Reading migration file: ${migrationFile}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Test connection
    console.log('📡 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database\n');
    
    // Execute migration
    console.log('⚙️  Executing migration...');
    await pool.query(sql);
    
    console.log('✅ Migration executed successfully!\n');
    
    // Verify users table exists
    console.log('🔍 Verifying users table...');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Users table exists');
      
      // Check if table has data
      const count = await pool.query('SELECT COUNT(*) as count FROM users');
      console.log(`   Users in table: ${count.rows[0].count}`);
    } else {
      console.log('⚠️  Users table not found (migration may have failed)');
    }
    
    await pool.end();
    console.log('\n🎉 Migration complete!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message.includes('already exists')) {
      console.log('\n💡 Tip: Table may already exist. This is OK if you\'re re-running the migration.');
    } else if (error.message.includes('password authentication')) {
      console.log('\n💡 Tip: Check your DB_USER and DB_PASSWORD');
    } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Tip: Check your DB_HOST and security group settings');
    }
    
    await pool.end();
    process.exit(1);
  }
}

// Get migration file from command line
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  console.error('Example: node scripts/run-migration.js lib/db/migrations/001_add_users_table.sql');
  process.exit(1);
}

runMigration(args[0]);

