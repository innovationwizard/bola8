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

async function testMaterialsTable() {
  try {
    console.log('🔍 Verifying materials table...\n');
    
    // Count total materials
    const countResult = await query('SELECT COUNT(*) as count FROM materials', []);
    console.log('✅ Materials table exists');
    console.log(`📊 Total materials: ${countResult.rows[0].count}\n`);
    
    // Count by category
    const categoriesResult = await query(
      'SELECT category, COUNT(*) as count FROM materials GROUP BY category ORDER BY category',
      []
    );
    
    console.log('📦 Materials by category:');
    categoriesResult.rows.forEach(row => {
      console.log(`   ${row.category}: ${row.count}`);
    });
    
    // Show a few sample materials
    const samplesResult = await query(
      'SELECT name_es, category, color FROM materials LIMIT 5',
      []
    );
    
    console.log('\n📋 Sample materials:');
    samplesResult.rows.forEach(row => {
      console.log(`   - ${row.name_es} (${row.category}) ${row.color ? `[${row.color}]` : ''}`);
    });
    
    console.log('\n🎉 Materials table is ready!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testMaterialsTable();

