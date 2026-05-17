const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

console.log('=== DB Config ===');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_PUBLIC_URL exists:', !!process.env.DATABASE_PUBLIC_URL);
console.log('PGHOST:', process.env.PGHOST || 'not set');

let poolConfig;
if (dbUrl) {
  poolConfig = {
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  };
} else if (process.env.PGHOST) {
  poolConfig = {
    host:     process.env.PGHOST,
    port:     process.env.PGPORT     || 5432,
    database: process.env.PGDATABASE || 'railway',
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false }
  };
} else {
  console.log('⚠️  No DB config found, using localhost');
  poolConfig = { host: 'localhost', port: 5432, database: 'autocenter' };
}

const pool = new Pool(poolConfig);

async function initDB() {
  const client = await pool.connect();
  try {
    console.log('🔄 تهيئة قاعدة البيانات...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await client.query(stmt).catch(e => {
          if (!e.message.includes('already exists')) {
            console.warn('SQL warning:', e.message.substring(0, 80));
          }
        });
      }
    }
    console.log('✅ قاعدة البيانات جاهزة');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };