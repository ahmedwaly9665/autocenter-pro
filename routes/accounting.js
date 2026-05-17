const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── GET /api/accounting/summary ───────────────────────────
router.get('/summary', authenticate, async (req, res) => {
  const { month, branch_id } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0,7);

  try {
    const branchFilter = req.user.role !== 'super_admin' && req.user.branch_id
      ? `AND o.branch_id = ${req.user.branch_id}`
      : branch_id ? `AND o.branch_id = ${branch_id}` : '';

    // الإيرادات
    const rev = await pool.query(`
      SELECT
        COALESCE(SUM(grand_total), 0)  AS total_revenue,
        COALESCE(SUM(vat_amount), 0)   AS total_vat,
        COALESCE(SUM(total_sell), 0)   AS total_before_vat,
        COUNT(*)                        AS orders_count
      FROM orders
      WHERE is_deleted = FALSE
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $1::DATE)
        ${branchFilter}
    `, [`${targetMonth}-01`]);

    // المشتريات
    const pur = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total_purchases
      FROM purchases
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $1::DATE)
      ${branchFilter.replace('o.branch_id', 'branch_id')}
    `, [`${targetMonth}-01`]);

    // المرتبات
    const sal = await pool.query(`
      SELECT COALESCE(SUM(e.base_salary),0) +
             COALESCE(SUM(sa_b.bonus),0) -
             COALESCE(SUM(sa_d.ded),0) AS total_salaries
      FROM employees e
      LEFT JOIN (
        SELECT employee_id, SUM(amount) AS bonus FROM salary_adjustments
        WHERE month=$1 AND adj_type='bonus' GROUP BY employee_id
      ) sa_b ON sa_b.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(amount) AS ded FROM salary_adjustments
        WHERE month=$1 AND adj_type='deduction' GROUP BY employee_id
      ) sa_d ON sa_d.employee_id = e.id
      WHERE e.status = 'active'
    `, [targetMonth]);

    // المصاريف التشغيلية
    const exp = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses
      WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', $1::DATE)
    `, [`${targetMonth}-01`]);

    // التحصيل الفعلي
    const coll = await pool.query(`
      SELECT COALESCE(SUM(p.amount), 0) AS total_collected
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', $1::DATE)
        AND o.is_deleted = FALSE ${branchFilter}
    `, [`${targetMonth}-01`]);

    const revenue      = parseFloat(rev.rows[0].total_revenue);
    const vatAmount    = parseFloat(rev.rows[0].total_vat);
    const purchases    = parseFloat(pur.rows[0].total_purchases);
    const salaries     = parseFloat(sal.rows[0].total_salaries);
    const expenses     = parseFloat(exp.rows[0].total_expenses);
    const totalExpenses= purchases + salaries + expenses;
    const netProfit    = revenue - totalExpenses;

    res.json({
      month: targetMonth,
      revenue,
      vat_amount:       vatAmount,
      revenue_before_vat: parseFloat(rev.rows[0].total_before_vat),
      orders_count:     parseInt(rev.rows[0].orders_count),
      total_expenses:   totalExpenses,
      expenses_breakdown: {
        purchases,
        salaries,
        operations: expenses
      },
      net_profit:   netProfit,
      profit_margin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : 0,
      total_collected: parseFloat(coll.rows[0].total_collected)
    });
  } catch (err) {
    console.error('accounting/summary error:', err);
    res.status(500).json({ error: 'خطأ في جلب الملخص المالي' });
  }
});

// ─── GET /api/accounting/transactions ──────────────────────
router.get('/transactions', authenticate, async (req, res) => {
  const { month, type, page = 1, limit = 100 } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0,7);
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(`
      SELECT 'revenue' AS type, o.order_ref AS description,
             b.name AS branch_name, o.total_sell AS amount,
             o.vat_amount AS vat, o.grand_total AS total, o.created_at AS date
      FROM orders o JOIN branches b ON o.branch_id = b.id
      WHERE o.is_deleted = FALSE
        AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', $1::DATE)
      UNION ALL
      SELECT 'purchase' AS type, s.name AS description,
             b.name AS branch_name, p.amount, p.vat, p.total, p.created_at AS date
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      JOIN branches b ON p.branch_id = b.id
      WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', $1::DATE)
      ORDER BY date DESC
      LIMIT $2 OFFSET $3
    `, [`${targetMonth}-01`, limit, offset]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب المعاملات' });
  }
});

// ─── GET /api/accounting/branch-comparison ─────────────────
router.get('/branch-comparison', authenticate, async (req, res) => {
  const { month } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0,7);

  try {
    const result = await pool.query(`
      SELECT b.id, b.name,
             COUNT(o.id)               AS orders_count,
             COALESCE(SUM(o.grand_total), 0) AS revenue,
             COALESCE(SUM(o.total_buy),  0)  AS cost,
             COALESCE(SUM(o.grand_total) - SUM(o.total_buy), 0) AS profit,
             COALESCE(SUM(p.amount), 0)      AS collected
      FROM branches b
      LEFT JOIN orders o ON o.branch_id = b.id
        AND o.is_deleted = FALSE
        AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', $1::DATE)
      LEFT JOIN payments p ON p.order_id = o.id
      GROUP BY b.id, b.name ORDER BY revenue DESC
    `, [`${targetMonth}-01`]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في مقارنة الفروع' });
  }
});

// ─── GET /api/accounting/vat-report ────────────────────────
router.get('/vat-report', authenticate, async (req, res) => {
  const { month } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0,7);

  try {
    const sales = await pool.query(`
      SELECT COUNT(*) AS invoices_count,
             COALESCE(SUM(total_sell),  0) AS taxable_amount,
             COALESCE(SUM(vat_amount),  0) AS vat_collected,
             COALESCE(SUM(grand_total), 0) AS total_with_vat
      FROM orders
      WHERE is_deleted = FALSE
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $1::DATE)
    `, [`${targetMonth}-01`]);

    const purchases = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS taxable_amount,
             COALESCE(SUM(vat),    0) AS vat_paid,
             COALESCE(SUM(total),  0) AS total_with_vat
      FROM purchases
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $1::DATE)
    `, [`${targetMonth}-01`]);

    const vatCollected = parseFloat(sales.rows[0].vat_collected);
    const vatPaid      = parseFloat(purchases.rows[0].vat_paid);

    res.json({
      month: targetMonth,
      sales: sales.rows[0],
      purchases: purchases.rows[0],
      vat_due: (vatCollected - vatPaid).toFixed(2),
      summary: {
        vat_collected: vatCollected,
        vat_paid:      vatPaid,
        net_vat_due:   (vatCollected - vatPaid).toFixed(2)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في تقرير الضريبة' });
  }
});

// ─── GET /api/accounting/profitability ─────────────────────
router.get('/profitability', authenticate, async (req, res) => {
  const { branch_id, month, limit = 100 } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0,7);

  try {
    let filter = `WHERE o.is_deleted = FALSE AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', $1::DATE)`;
    const params = [`${targetMonth}-01`];

    if (req.user.role !== 'super_admin' && req.user.branch_id) {
      params.push(req.user.branch_id); filter += ` AND o.branch_id = $${params.length}`;
    } else if (branch_id) {
      params.push(branch_id); filter += ` AND o.branch_id = $${params.length}`;
    }
    params.push(limit);

    const result = await pool.query(`
      SELECT o.id, o.order_ref, o.total_buy, o.total_sell, o.grand_total,
             o.total_sell - o.total_buy AS profit,
             ROUND((o.total_sell - o.total_buy) / NULLIF(o.total_sell, 0) * 100, 1) AS profit_margin,
             v.owner_name, v.plate_number, v.car_type,
             b.name AS branch_name, e.name AS technician_name,
             o.status, o.created_at,
             COALESCE(SUM(p.amount), 0) AS total_paid
      FROM orders o
      JOIN vehicles v ON o.vehicle_id = v.id
      JOIN branches b ON o.branch_id = b.id
      LEFT JOIN employees e ON o.technician_id = e.id
      LEFT JOIN payments p ON p.order_id = o.id
      ${filter}
      GROUP BY o.id, v.id, b.id, e.id
      ORDER BY profit DESC
      LIMIT $${params.length}
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في تقرير الربحية' });
  }
});

// ─── GET /api/accounting/settings ──────────────────────────
router.get('/settings', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM system_settings WHERE key != $1', ['admin_password']);
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب الإعدادات' });
  }
});

router.put('/settings', authenticate, async (req, res) => {
  const { password, ...updates } = req.body;
  const bcrypt = require('bcryptjs');

  try {
    // تحقق من كلمة مرور مدير الفروع
    const stored = await pool.query("SELECT value FROM system_settings WHERE key='admin_password'");
    const valid = await bcrypt.compare(password, stored.rows[0].value);
    if (!valid) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });

    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, value]
      );
    }
    res.json({ message: 'تم حفظ الإعدادات' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في حفظ الإعدادات' });
  }
});

module.exports = router;
