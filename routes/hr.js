// ============================================================
// routes/employees.js
// ============================================================
const express = require('express');
const empRouter = express.Router();
const { pool } = require('../db');
const { authenticate, requireManager } = require('../middleware/auth');

empRouter.get('/', authenticate, async (req, res) => {
  try {
    const branchFilter = req.user.role !== 'super_admin' && req.user.branch_id
      ? `AND e.branch_id = ${req.user.branch_id}` : '';
    const result = await pool.query(`
      SELECT e.*, b.name AS branch_name,
             COUNT(DISTINCT o.id) AS total_orders
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN orders o ON o.technician_id = e.id AND o.is_deleted = FALSE
      WHERE 1=1 ${branchFilter}
      GROUP BY e.id, b.name ORDER BY e.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'خطأ في جلب الموظفين' }); }
});

empRouter.post('/', authenticate, requireManager, async (req, res) => {
  const { name, national_id, job_title, branch_id, base_salary, phone, hire_date } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الموظف مطلوب' });
  try {
    const branchId = req.user.role === 'super_admin' ? branch_id : req.user.branch_id;
    const result = await pool.query(
      `INSERT INTO employees (name, national_id, job_title, branch_id, base_salary, phone, hire_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, national_id, job_title, branchId, base_salary || 0, phone, hire_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في إضافة الموظف' }); }
});

empRouter.put('/:id', authenticate, requireManager, async (req, res) => {
  const { name, national_id, job_title, branch_id, base_salary, phone, status, hire_date } = req.body;
  try {
    const result = await pool.query(
      `UPDATE employees SET name=$1, national_id=$2, job_title=$3, branch_id=$4,
       base_salary=$5, phone=$6, status=$7, hire_date=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, national_id, job_title, branch_id, base_salary, phone, status || 'active', hire_date, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'الموظف غير موجود' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في تعديل الموظف' }); }
});

// ============================================================
// routes/suppliers.js
// ============================================================
const supRouter = express.Router();

supRouter.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
             COALESCE(SUM(p.total) FILTER (WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', NOW())), 0) AS purchases_this_month,
             COALESCE(SUM(p.total) FILTER (WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0) AS purchases_last_month
      FROM suppliers s
      LEFT JOIN purchases p ON p.supplier_id = s.id
      GROUP BY s.id ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'خطأ في جلب الموردين' }); }
});

supRouter.post('/', authenticate, requireManager, async (req, res) => {
  const { name, category, contact_name, phone, tax_id, rating, lead_days, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
  try {
    const result = await pool.query(
      `INSERT INTO suppliers (name, category, contact_name, phone, tax_id, rating, lead_days, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, category, contact_name, phone, tax_id, rating || 5, lead_days || 3, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في إضافة المورد' }); }
});

supRouter.put('/:id', authenticate, requireManager, async (req, res) => {
  const { name, category, contact_name, phone, tax_id, rating, lead_days, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE suppliers SET name=$1, category=$2, contact_name=$3, phone=$4,
       tax_id=$5, rating=$6, lead_days=$7, notes=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, category, contact_name, phone, tax_id, rating, lead_days, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في تعديل المورد' }); }
});

// ============================================================
// routes/payroll.js
// ============================================================
const payRouter = express.Router();

// GET /api/payroll?month=2026-05
payRouter.get('/', authenticate, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0,7);
  try {
    const branchFilter = req.user.role !== 'super_admin' && req.user.branch_id
      ? `AND e.branch_id = ${req.user.branch_id}` : '';

    const result = await pool.query(`
      SELECT e.id, e.name, e.job_title, e.base_salary, b.name AS branch_name,
             COALESCE(SUM(sa.amount) FILTER (WHERE sa.adj_type='bonus'),     0) AS total_bonus,
             COALESCE(SUM(sa.amount) FILTER (WHERE sa.adj_type='deduction'), 0) AS total_deduction,
             e.base_salary
               + COALESCE(SUM(sa.amount) FILTER (WHERE sa.adj_type='bonus'),     0)
               - COALESCE(SUM(sa.amount) FILTER (WHERE sa.adj_type='deduction'), 0) AS net_salary,
             json_agg(
               jsonb_build_object('type', sa.adj_type, 'amount', sa.amount, 'reason', sa.reason)
             ) FILTER (WHERE sa.id IS NOT NULL) AS adjustments
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN salary_adjustments sa ON sa.employee_id = e.id AND sa.month = $1
      WHERE e.status = 'active' ${branchFilter}
      GROUP BY e.id, b.name ORDER BY e.name
    `, [month]);

    const total = result.rows.reduce((sum, r) => sum + parseFloat(r.net_salary), 0);
    res.json({ month, employees: result.rows, total_net: total.toFixed(2) });
  } catch (err) { res.status(500).json({ error: 'خطأ في جلب المرتبات' }); }
});

// POST /api/payroll/adjustment - إضافة عمولة أو خصم
payRouter.post('/adjustment', authenticate, requireManager, async (req, res) => {
  const { employee_id, month, adj_type, amount, reason } = req.body;
  if (!employee_id || !month || !adj_type || !amount) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO salary_adjustments (employee_id, month, adj_type, amount, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, month, adj_type, amount, reason, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'خطأ في إضافة التعديل' }); }
});

module.exports = { empRouter, supRouter, payRouter };
