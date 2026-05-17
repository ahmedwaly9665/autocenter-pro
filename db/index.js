const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// تهيئة قاعدة البيانات
async function initDB() {
  const client = await pool.connect();
  try {
    console.log('🔄 جاري تهيئة قاعدة البيانات...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️  قاعدة البيانات موجودة مسبقاً، تم التخطي');
    } else {
      console.error('❌ خطأ في تهيئة قاعدة البيانات:', err.message);
      throw err;
    }
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
