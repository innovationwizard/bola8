#!/usr/bin/env node
/**
 * Create User Script
 * 
 * Creates a new user in the database with hashed password.
 * 
 * Usage:
 *   node scripts/create-user.js <email> <name> <password> [role]
 * 
 * Example:
 *   node scripts/create-user.js admin@bola8.com "Admin User" "securepassword123" admin
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function createUser(email, name, password, role = 'designer') {
  try {
    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (existing.rows.length > 0) {
      console.log('⚠️  User already exists with this email');
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('Do you want to update the password? (y/n): ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() === 'y') {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
          'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
          [hash, email.toLowerCase()]
        );
        console.log('✅ Password updated successfully');
        await pool.end();
        return;
      } else {
        console.log('❌ Cancelled');
        await pool.end();
        return;
      }
    }
    
    // Hash password
    console.log('🔐 Hashing password...');
    const hash = await bcrypt.hash(password, 10);
    
    // Create user
    console.log('👤 Creating user...');
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, name, role`,
      [email.toLowerCase(), name, hash, role]
    );
    
    const user = result.rows[0];
    console.log('\n✅ User created successfully!');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Name:', user.name);
    console.log('   Role:', user.role);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    await pool.end();
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: node scripts/create-user.js <email> <name> <password> [role]');
  console.error('Example: node scripts/create-user.js admin@bola8.com "Admin User" "password123" admin');
  process.exit(1);
}

const [email, name, password, role = 'designer'] = args;

if (!['admin', 'designer', 'viewer'].includes(role)) {
  console.error('❌ Invalid role. Must be: admin, designer, or viewer');
  process.exit(1);
}

createUser(email, name, password, role);

