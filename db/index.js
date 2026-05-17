const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'موجود ✅' : 'غير موجود ❌');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: 'localhost',
        port: 5432,
        database: 'autocenter'
      }
);

async function initDB() {
  const client = await pool.connect();
  try {
    console.log('🔄 جاري تهيئة قاعدة البيانات...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️  قاعدة البيانات موجودة مسبقاً');
    } else {
      console.error('❌ خطأ في قاعدة البيانات:', err.message);
      throw err;
    }
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };