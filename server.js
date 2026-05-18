// Fallback values for demo (Railway workaround)
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:ZqdygFGYQjlNHGvTFQBnYhZxosNSfgzK@hopper.proxy.rlwy.net:57725/railway';
process.env.JWT_SECRET = process.env.JWT_SECRET
  || 'autocenter2026SuperSecretKey!XYZ789';

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { initDB } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 500 });
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/auth/login', loginLimiter);

// API Routes
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

app.get('/api/health', (req, res) => {
  res.json({
    status:    'OK',
    version:   '1.0.1',
    app:       process.env.APP_NAME || 'AutoCenter Pro',
    db:        !!process.env.DATABASE_URL,
    timestamp: new Date().toISOString()
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ AutoCenter Pro - Port ${PORT}`);
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌'}`);
    console.log(`JWT_SECRET:   ${process.env.JWT_SECRET   ? 'SET ✅' : 'NOT SET ❌'}`);
  });

  try {
    await initDB();
    console.log('✅ Database ready');
  } catch (err) {
    console.error('⚠️  DB error:', err.message);
  }
}

start();
