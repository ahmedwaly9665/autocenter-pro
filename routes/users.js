const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// GET /api/users
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id,
             u.phone, u.national_id, u.is_active, u.last_login, u.created_at,
             b.name AS branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب المستخدمين' });
  }
});

// POST /api/users - إضافة مستخدم
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  const { username, password, full_name, role, branch_id, phone, national_id } = req.body;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'الحقول المطلوبة: username, password, full_name, role' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, branch_id, phone, national_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, full_name, role, branch_id, phone, national_id, is_active, created_at`,
      [username.toLowerCase(), hash, full_name, role, branch_id || null, phone, national_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في إضافة المستخدم' });
  }
});

// PUT /api/users/:id - تعديل مستخدم
router.put('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { full_name, role, branch_id, phone, national_id, is_active, new_password } = req.body;

  try {
    let passwordUpdate = '';
    const params = [full_name, role, branch_id || null, phone, national_id, is_active !== undefined ? is_active : true, req.params.id];

    if (new_password) {
      if (new_password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      const hash = await bcrypt.hash(new_password, 10);
      passwordUpdate = ', password_hash = $8';
      params.push(hash);
    }

    const result = await pool.query(
      `UPDATE users SET full_name=$1, role=$2, branch_id=$3, phone=$4,
       national_id=$5, is_active=$6, updated_at=NOW() ${passwordUpdate}
       WHERE id=$7 RETURNING id, username, full_name, role, branch_id, is_active`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في تعديل المستخدم' });
  }
});

// DELETE /api/users/:id - حذف مستخدم
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
  }
  try {
    await pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم تعطيل المستخدم' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في حذف المستخدم' });
  }
});

module.exports = router;
