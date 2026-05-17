// ============================================================
// routes/parts.js
// ============================================================
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireManager } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, category, branch_id } = req.query;
    let filter = 'WHERE 1=1';
    const params = [];

    if (req.user.role !== 'super_admin' && req.user.branch_id) {
      params.push(req.user.branch_id); filter += ` AND p.branch_id = $${params.length}`;
    } else if (branch_id) {
      params.push(branch_id); filter += ` AND p.branch_id = $${params.length}`;
    }
    if (search)   { params.push(`%${search}%`);   filter += ` AND p.part_name ILIKE $${params.length}`; }
    if (category) { params.push(category);          filter += ` AND p.category = $${params.length}`; }

    const result = await pool.query(`
      SELECT p.*, s.name AS supplier_name, b.name AS branch_name
      FROM parts_inventory p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN branches b ON p.branch_id = b.id
      ${filter} ORDER BY p.part_name
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'خطأ في جلب قطع الغيار' }); }
});

router.post('/', authenticate, requireManager, async (req, res) => {
  const { part_name, category, supplier_id, branch_id, buy_price, sell_price, stock_qty, min_qty, unit } = req.body;
  if (!part_name) return res.status(400).json({ error: 'اسم القطعة مطلوب' });
  try {
    const branchId = req.user.role === 'super_admin' ? branch_id : req.user.branch_id;
    const result = await pool.query(
      `INSERT INTO parts_inventory (part_name, category, supplier_id, branch_id, buy_price, sell_price, stock_qty, min_qty, unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [part_name, category, supplier_id || null, branchId, buy_price || 0, sell_price || 0, stock_qty || 0, min_qty || 5, unit || 'قطعة']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في إضافة القطعة' }); }
});

router.put('/:id', authenticate, requireManager, async (req, res) => {
  const { part_name, category, supplier_id, buy_price, sell_price, stock_qty, min_qty } = req.body;
  try {
    const result = await pool.query(
      `UPDATE parts_inventory SET part_name=$1, category=$2, supplier_id=$3,
       buy_price=$4, sell_price=$5, stock_qty=$6, min_qty=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [part_name, category, supplier_id || null, buy_price, sell_price, stock_qty, min_qty || 5, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'القطعة غير موجودة' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في تعديل القطعة' }); }
});

router.delete('/:id', authenticate, requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM parts_inventory WHERE id=$1', [req.params.id]);
    res.json({ message: 'تم حذف القطعة' });
  } catch (err) { res.status(500).json({ error: 'خطأ في حذف القطعة' }); }
});

module.exports = router;
