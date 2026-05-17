const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL 
  || process.env.DATABASE_PUBLIC_URL;

console.log('DB_URL found:', !!DB_URL);

const pool = new Pool(DB_URL 
  ? { connectionString: DB_URL, ssl: { rejectUnauthorized: false } }
  : { host: 'localhost', port: 5432, database: 'autocenter' }
);

// مهم جداً - يمنع crash عند خطأ في الاتصال
pool.on('error', (err) => {
  console.error('Pool error (non-fatal):', err.message);
});

async function initDB() {
  console.log('Connecting to DB...');
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'), 'utf8'
    );
    const stmts = schema.split(';').filter(s => s.trim().length > 5);
    for (const stmt of stmts) {
      await client.query(stmt).catch(e => {
        if (!e.message.includes('already exists')) {
          console.warn('SQL skip:', e.message.slice(0, 60));
        }
      });
    }
    console.log('✅ DB ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };