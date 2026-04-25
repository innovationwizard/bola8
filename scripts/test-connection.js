#!/usr/bin/env node
/**
 * Database Connection Test Script
 * 
 * Tests the connection to your RDS database.
 * 
 * Usage:
 *   node scripts/test-connection.js
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Create pool for testing
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  return await pool.query(text, params);
}

async function test() {
  console.log('🧪 Testing database connection...\n');
  
  // Check required env vars
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('   Make sure .env.local file exists with all DB_* variables');
    process.exit(1);
  }
  
  try {
    // Test basic connection
    console.log('📡 Testing connection...');
    const timeResult = await query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Connected successfully!');
    console.log('   Current time:', timeResult.rows[0].current_time);
    console.log('   PostgreSQL:', timeResult.rows[0].pg_version.split(' ')[0] + ' ' + timeResult.rows[0].pg_version.split(' ')[1]);
    
    // Check tables
    console.log('\n📊 Checking tables...');
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const expectedTables = [
      'projects',
      'site_visits', 
      'images',
      'quotes',
      'design_files',
      'client_reviews',
      'project_notes'
    ];
    
    const foundTables = tables.rows.map(r => r.table_name);
    const missingTables = expectedTables.filter(t => !foundTables.includes(t));
    
    if (missingTables.length > 0) {
      console.log('⚠️  Missing tables:', missingTables.join(', '));
      console.log('   Run: node scripts/setup-database.js');
    } else {
      console.log('✅ All tables present:', foundTables.join(', '));
    }
    
    // Test each table
    console.log('\n🔍 Testing table access...');
    for (const table of expectedTables) {
      if (foundTables.includes(table)) {
        try {
          const count = await query(`SELECT COUNT(*) as count FROM ${table}`);
          console.log(`   ✅ ${table}: ${count.rows[0].count} rows`);
        } catch (err) {
          console.log(`   ❌ ${table}: Error - ${err.message}`);
        }
      }
    }
    
    console.log('\n🎉 Database connection test complete!');
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    
    if (error.message.includes('password authentication')) {
      console.log('\n💡 Tip: Check your DB_USER and DB_PASSWORD');
    } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Tip: Check your DB_HOST and security group settings');
    } else if (error.message.includes('does not exist')) {
      console.log('\n💡 Tip: Database might not exist. Run: node scripts/setup-database.js');
    }
    
    await pool.end();
    process.exit(1);
  }
}

test();

