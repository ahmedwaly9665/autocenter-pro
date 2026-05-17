// v1.0.1 - with database config
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const { initDB } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Rate limiting - حماية من الهجمات
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 500,
  message: { error: 'طلبات كثيرة جداً، يرجى المحاولة بعد قليل' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'محاولات تسجيل دخول كثيرة، يرجى الانتظار 15 دقيقة' }
});

app.use('/api/', limiter);
app.use('/api/auth/login', loginLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── API Routes ─────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/branches',   require('./routes/branches'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/parts',      require('./routes/parts'));
app.use('/api/accounting', require('./routes/accounting'));

const { empRouter, supRouter, payRouter } = require('./routes/hr');
app.use('/api/employees', empRouter);
app.use('/api/suppliers', supRouter);
app.use('/api/payroll',   payRouter);

// ─── Health Check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:    'OK',
    version:   '1.0.0',
    app:       process.env.APP_NAME || 'AutoCenter Pro',
    timestamp: new Date().toISOString()
  });
});

// ─── Serve Frontend ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// ─── Start ──────────────────────────────────────────────────
async function start() {
  // ابدأ الخادم أولاً بدون انتظار قاعدة البيانات
  app.listen(PORT, () => {
    console.log(`\n🚀 AutoCenter Pro يعمل على المنفذ ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/health`);
    console.log(`\n🔍 ENV Check:`);
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅' : '❌'}`);
    console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅' : '❌'}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  });

  // حاول تهيئة قاعدة البيانات بشكل منفصل
  try {
    await initDB();
    console.log('✅ قاعدة البيانات جاهزة');
  } catch (err) {
    console.error('⚠️  قاعدة البيانات غير متاحة:', err.message);
    console.log('🔄 الخادم يعمل بدون قاعدة بيانات');
  }
}