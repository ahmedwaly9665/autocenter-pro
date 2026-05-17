const jwt = require('jsonwebtoken');

// التحقق من التوكن
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'غير مصرح — الرجاء تسجيل الدخول' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة منتهية — الرجاء تسجيل الدخول مجدداً' });
  }
}

// تحقق من الصلاحية
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
    }
    next();
  };
}

// مدير الفروع أو مدير فرع فقط
function requireManager(req, res, next) {
  if (!['super_admin', 'branch_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'هذه العملية لمدير الفرع أو مدير الفروع فقط' });
  }
  next();
}

// مدير الفروع الكامل فقط
function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'هذه العملية لمدير الفروع الكامل فقط' });
  }
  next();
}

// تحقق أن المستخدم يتعامل مع فرعه فقط (إلا مدير الفروع)
function branchFilter(req, res, next) {
  if (req.user.role !== 'super_admin' && req.user.branch_id) {
    req.userBranchId = req.user.branch_id;
  }
  next();
}

module.exports = { authenticate, requireRole, requireManager, requireSuperAdmin, branchFilter };
