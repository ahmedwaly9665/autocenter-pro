require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    port: PORT,
    DATABASE_URL: (process.env.DATABASE_URL || 'NOT_SET').substring(0, 25),
    PG_URL:       (process.env.PG_URL       || 'NOT_SET').substring(0, 25),
    JWT_SECRET:   (process.env.JWT_SECRET   || 'NOT_SET').substring(0, 10),
    NODE_ENV:      process.env.NODE_ENV,
    timestamp:     new Date().toISOString()
  });
});

app.get('/api/env', (req, res) => {
  const env = {};
  Object.keys(process.env).forEach(key => {
    env[key] = (process.env[key] || '').substring(0, 50);
  });
  res.json(env);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
  console.log(`PG_URL: ${process.env.PG_URL ? 'SET' : 'NOT SET'}`);
  console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET'}`);
});
