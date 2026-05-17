const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// GET /api/branches - جلب جميع الفروع
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*,
             COUNT(DISTINCT u.id)  FILTER (WHERE u.is_active) AS staff_count,
             COUNT(DISTINCT o.id)  FILTER (WHERE o.is_deleted = FALSE AND o.status != 'cancelled') AS total_orders,
             COALESCE(SUM(o.grand_total) FILTER (WHERE o.is_deleted = FALSE AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())), 0) AS revenue_this_month
      FROM branches b
      LEFT JOIN users u ON u.branch_id = b.id
      LEFT JOIN orders o ON o.branch_id = b.id
      GROUP BY b.id
      ORDER BY b.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في جلب الفروع' });
  }
});

// GET /api/branches/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branches WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'الفرع غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب الفرع' });
  }
});

// POST /api/branches - إضافة فرع جديد (مدير الفروع فقط)
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, city, address, phone, manager_name } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الفرع مطلوب' });

  try {
    const result = await pool.query(
      `INSERT INTO branches (name, city, address, phone, manager_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, city, address, phone, manager_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في إضافة الفرع' });
  }
});

// PUT /api/branches/:id - تعديل فرع
router.put('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, city, address, phone, manager_name, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE branches SET name=$1, city=$2, address=$3, phone=$4,
       manager_name=$5, status=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, city, address, phone, manager_name, status || 'active', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'الفرع غير موجود' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في تعديل الفرع' });
  }
});

// DELETE /api/branches/:id - حذف فرع
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // تحقق أنه ليس فيه موظفين أو طلبات
    const check = await pool.query(
      'SELECT COUNT(*) FROM orders WHERE branch_id = $1 AND is_deleted = FALSE',
      [req.params.id]
    );
    if (parseInt(check.rows[0].count) > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف الفرع — يحتوي على طلبات. غيّر حالته لـ "غير نشط" بدلاً من الحذف' });
    }
    await pool.query('DELETE FROM branches WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف الفرع' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في حذف الفرع' });
  }
});

module.exports = router;
