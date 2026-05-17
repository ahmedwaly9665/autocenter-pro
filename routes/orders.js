const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireManager, requireSuperAdmin, branchFilter } = require('../middleware/auth');

// ─── helpers ───────────────────────────────────────────────
function buildOrderFilter(user, extra = '') {
  const conditions = [`o.is_deleted = FALSE ${extra}`];
  const params = [];
  if (user.role !== 'super_admin' && user.branch_id) {
    params.push(user.branch_id);
    conditions.push(`o.branch_id = $${params.length}`);
  }
  return { where: conditions.join(' AND '), params };
}

// ─── GET /api/orders ────────────────────────────────────────
router.get('/', authenticate, branchFilter, async (req, res) => {
  try {
    const { where, params } = buildOrderFilter(req.user);
    const { status, branch_id, search, page = 1, limit = 50 } = req.query;

    let filter = where;
    if (status)    { params.push(status);    filter += ` AND o.status = $${params.length}`; }
    if (branch_id && req.user.role === 'super_admin') {
                     params.push(branch_id);  filter += ` AND o.branch_id = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      filter += ` AND (v.plate_number ILIKE $${params.length} OR v.license_no ILIKE $${params.length} OR v.owner_name ILIKE $${params.length})`;
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await pool.query(`
      SELECT o.id, o.order_ref, o.status, o.total_buy, o.total_sell, o.vat_amount, o.grand_total,
             o.km_reading, o.problem_desc, o.created_at, o.updated_at,
             v.plate_number, v.license_no, v.owner_name, v.owner_phone, v.car_type, v.car_year,
             b.name AS branch_name,
             e.name AS technician_name,
             u.full_name AS created_by_name,
             COALESCE(SUM(p.amount), 0) AS total_paid,
             COUNT(DISTINCT ae.id) AS edit_count,
             json_agg(DISTINCT jsonb_build_object(
               'id', op.id, 'part_name', op.part_name, 'qty', op.qty,
               'buy_price', op.buy_price, 'sell_price', op.sell_price, 'total', op.total
             )) FILTER (WHERE op.id IS NOT NULL) AS parts
      FROM orders o
      JOIN vehicles v ON o.vehicle_id = v.id
      JOIN branches b ON o.branch_id = b.id
      LEFT JOIN employees e ON o.technician_id = e.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN payments p ON p.order_id = o.id
      LEFT JOIN order_edits ae ON ae.order_id = o.id
      LEFT JOIN order_parts op ON op.order_id = o.id
      WHERE ${filter}
      GROUP BY o.id, v.id, b.id, e.id, u.id
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT o.id) FROM orders o JOIN vehicles v ON o.vehicle_id = v.id WHERE ${filter}`,
      params.slice(0, -2)
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('GET /orders error:', err);
    res.status(500).json({ error: 'خطأ في جلب الطلبات' });
  }
});

// ─── GET /api/orders/:id ────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, v.plate_number, v.license_no, v.owner_name, v.owner_phone, v.car_type, v.car_year,
             b.name AS branch_name, e.name AS technician_name, u.full_name AS created_by_name,
             COALESCE(SUM(p.amount), 0) AS total_paid
      FROM orders o
      JOIN vehicles v ON o.vehicle_id = v.id
      JOIN branches b ON o.branch_id = b.id
      LEFT JOIN employees e ON o.technician_id = e.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1 AND o.is_deleted = FALSE
      GROUP BY o.id, v.id, b.id, e.id, u.id
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });

    // جلب القطع
    const parts = await pool.query('SELECT * FROM order_parts WHERE order_id = $1', [req.params.id]);
    // جلب الدفعات
    const payments = await pool.query(`
      SELECT p.*, u.full_name AS collector_name
      FROM payments p LEFT JOIN users u ON p.collector_id = u.id
      WHERE p.order_id = $1 ORDER BY p.created_at
    `, [req.params.id]);
    // جلب سجل التعديلات
    const edits = await pool.query(`
      SELECT ae.*, u.full_name AS editor_name
      FROM order_edits ae JOIN users u ON ae.edited_by = u.id
      WHERE ae.order_id = $1 ORDER BY ae.created_at
    `, [req.params.id]);

    res.json({
      ...result.rows[0],
      parts: parts.rows,
      payments: payments.rows,
      edits: edits.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب الطلب' });
  }
});

// ─── POST /api/orders ───────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  const { plate_number, license_no, owner_name, owner_phone, car_type, car_year,
          branch_id, technician_id, km_reading, problem_desc, parts } = req.body;

  if (!plate_number || !owner_name || !branch_id) {
    return res.status(400).json({ error: 'رقم اللوحة واسم المالك والفرع مطلوبة' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // إيجاد أو إنشاء السيارة
    let vehicle = await client.query(
      'SELECT id FROM vehicles WHERE plate_number = $1 AND branch_id = $2',
      [plate_number.toUpperCase(), branch_id]
    );

    let vehicleId;
    if (vehicle.rows.length) {
      vehicleId = vehicle.rows[0].id;
      await client.query(
        `UPDATE vehicles SET license_no=$1, owner_name=$2, owner_phone=$3, car_type=$4, car_year=$5 WHERE id=$6`,
        [license_no, owner_name, owner_phone, car_type, car_year, vehicleId]
      );
    } else {
      const newV = await client.query(
        `INSERT INTO vehicles (plate_number, license_no, owner_name, owner_phone, car_type, car_year, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [plate_number.toUpperCase(), license_no, owner_name, owner_phone, car_type, car_year, branch_id]
      );
      vehicleId = newV.rows[0].id;
    }

    // حساب الإجماليات
    const vatRate = 0.15;
    let totalBuy = 0, totalSell = 0;
    const partsArr = Array.isArray(parts) ? parts : [];

    partsArr.forEach(p => {
      totalBuy  += (parseFloat(p.buy_price)  || 0) * (parseInt(p.qty) || 1);
      totalSell += (parseFloat(p.sell_price) || 0) * (parseInt(p.qty) || 1);
    });

    const vatAmount  = Math.round(totalSell * vatRate * 100) / 100;
    const grandTotal = Math.round((totalSell + vatAmount) * 100) / 100;

    // إنشاء الطلب
    const orderRef = await client.query('SELECT gen_order_ref() AS ref');
    const order = await client.query(
      `INSERT INTO orders
         (order_ref, vehicle_id, branch_id, technician_id, created_by,
          km_reading, problem_desc, total_buy, total_sell, vat_amount, grand_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [orderRef.rows[0].ref, vehicleId, branch_id, technician_id || null, req.user.id,
       km_reading, problem_desc, totalBuy, totalSell, vatAmount, grandTotal]
    );

    const orderId = order.rows[0].id;

    // إضافة القطع
    for (const p of partsArr) {
      const qty  = parseInt(p.qty)  || 1;
      const buy  = parseFloat(p.buy_price)  || 0;
      const sell = parseFloat(p.sell_price) || 0;
      const vat  = Math.round(sell * vatRate * 100) / 100;
      await client.query(
        `INSERT INTO order_parts (order_id, part_name, qty, buy_price, sell_price, vat, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, p.part_name, qty, buy, sell, vat, Math.round((sell + vat) * qty * 100) / 100]
      );
    }

    // إنشاء الفاتورة
    await client.query(
      `INSERT INTO invoices (order_id, subtotal, vat_amount, total)
       VALUES ($1,$2,$3,$4)`,
      [orderId, totalSell, vatAmount, grandTotal]
    );

    await client.query('COMMIT');

    res.status(201).json({ ...order.rows[0], parts: partsArr });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /orders error:', err);
    res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/orders/:id ─────────────────────────────────────
router.put('/:id', authenticate, requireManager, async (req, res) => {
  const { owner_name, license_no, plate_number, car_type, owner_phone,
          technician_id, status, total_buy, total_sell, reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT o.*, v.owner_name, v.license_no, v.plate_number FROM orders o JOIN vehicles v ON o.vehicle_id = v.id WHERE o.id = $1',
      [req.params.id]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });

    const old = current.rows[0];

    // تحقق أن مدير الفرع يعدل على فرعه فقط
    if (req.user.role === 'branch_manager' && old.branch_id !== req.user.branch_id) {
      return res.status(403).json({ error: 'يمكنك تعديل طلبات فرعك فقط' });
    }

    // تسجيل التغييرات في Audit Trail
    const changes = [];
    if (status    && status    !== old.status)     changes.push({ field: 'status',    old: old.status,     new: status });
    if (owner_name && owner_name !== old.owner_name) changes.push({ field: 'owner_name', old: old.owner_name, new: owner_name });
    if (total_sell && parseFloat(total_sell) !== parseFloat(old.total_sell))
      changes.push({ field: 'total_sell', old: old.total_sell, new: total_sell });

    for (const ch of changes) {
      await client.query(
        `INSERT INTO order_edits (order_id, edited_by, field_changed, old_value, new_value, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, req.user.id, ch.field, ch.old, ch.new, reason || 'تعديل']
      );
    }

    // تحديث بيانات السيارة
    if (owner_name || license_no || plate_number || car_type || owner_phone) {
      await client.query(
        `UPDATE vehicles SET
          owner_name = COALESCE($1, owner_name),
          license_no = COALESCE($2, license_no),
          plate_number = COALESCE($3, plate_number),
          car_type = COALESCE($4, car_type),
          owner_phone = COALESCE($5, owner_phone)
         WHERE id = $6`,
        [owner_name, license_no, plate_number, car_type, owner_phone, old.vehicle_id]
      );
    }

    // إعادة حساب الإجماليات إذا تغيرت الأسعار
    let newTotalSell = parseFloat(total_sell) || parseFloat(old.total_sell);
    let newTotalBuy  = parseFloat(total_buy)  || parseFloat(old.total_buy);
    const vatAmount  = Math.round(newTotalSell * 0.15 * 100) / 100;
    const grandTotal = Math.round((newTotalSell + vatAmount) * 100) / 100;

    const updated = await client.query(
      `UPDATE orders SET
        status       = COALESCE($1, status),
        technician_id= COALESCE($2, technician_id),
        total_sell   = $3,
        total_buy    = $4,
        vat_amount   = $5,
        grand_total  = $6,
        updated_at   = NOW()
       WHERE id = $7 RETURNING *`,
      [status, technician_id, newTotalSell, newTotalBuy, vatAmount, grandTotal, req.params.id]
    );

    // تحديث الفاتورة
    await client.query(
      'UPDATE invoices SET subtotal=$1, vat_amount=$2, total=$3 WHERE order_id=$4',
      [newTotalSell, vatAmount, grandTotal, req.params.id]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /orders error:', err);
    res.status(500).json({ error: 'خطأ في تعديل الطلب' });
  } finally {
    client.release();
  }
});

// ─── POST /api/orders/:id/delete-request ───────────────────
router.post('/:id/delete-request', authenticate, async (req, res) => {
  const { reason, notes } = req.body;
  if (!reason) return res.status(400).json({ error: 'سبب الحذف مطلوب' });

  try {
    const existing = await pool.query(
      "SELECT id FROM delete_requests WHERE order_id=$1 AND status='pending'",
      [req.params.id]
    );
    if (existing.rows.length) return res.status(400).json({ error: 'يوجد طلب حذف معلق بالفعل لهذا الأوردر' });

    const result = await pool.query(
      `INSERT INTO delete_requests (order_id, requested_by, reason, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, reason, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في إرسال طلب الحذف' });
  }
});

// ─── GET /api/orders/delete-requests/pending ───────────────
router.get('/delete-requests/pending', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dr.*, o.order_ref, v.owner_name, v.plate_number, v.car_type,
             b.name AS branch_name, u.full_name AS requested_by_name
      FROM delete_requests dr
      JOIN orders o ON dr.order_id = o.id
      JOIN vehicles v ON o.vehicle_id = v.id
      JOIN branches b ON o.branch_id = b.id
      JOIN users u ON dr.requested_by = u.id
      WHERE dr.status = 'pending'
      ORDER BY dr.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب طلبات الحذف' });
  }
});

// ─── PUT /api/orders/delete-requests/:reqId/decide ─────────
router.put('/delete-requests/:reqId/decide', authenticate, requireSuperAdmin, async (req, res) => {
  const { decision } = req.body; // 'approved' or 'rejected'
  if (!['approved','rejected'].includes(decision)) {
    return res.status(400).json({ error: 'القرار يجب أن يكون approved أو rejected' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dr = await client.query('SELECT * FROM delete_requests WHERE id=$1', [req.params.reqId]);
    if (!dr.rows.length) return res.status(404).json({ error: 'طلب الحذف غير موجود' });

    await client.query(
      'UPDATE delete_requests SET status=$1, decided_by=$2, decided_at=NOW() WHERE id=$3',
      [decision, req.user.id, req.params.reqId]
    );

    if (decision === 'approved') {
      await client.query(
        'UPDATE orders SET is_deleted=TRUE, deleted_at=NOW(), deleted_by=$1 WHERE id=$2',
        [req.user.id, dr.rows[0].order_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: decision === 'approved' ? 'تم الموافقة على الحذف' : 'تم رفض طلب الحذف' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'خطأ في معالجة طلب الحذف' });
  } finally {
    client.release();
  }
});

// ─── POST /api/orders/:id/payments ─────────────────────────
router.post('/:id/payments', authenticate, async (req, res) => {
  const { amount, method, notes } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
  if (!['cash','card','transfer'].includes(method)) return res.status(400).json({ error: 'طريقة الدفع غير صحيحة' });

  try {
    // تحقق أن المبلغ لا يتجاوز المتبقي
    const order = await pool.query('SELECT grand_total FROM orders WHERE id=$1 AND is_deleted=FALSE', [req.params.id]);
    if (!order.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });

    const totalPaid = await pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1', [req.params.id]);
    const remain = parseFloat(order.rows[0].grand_total) - parseFloat(totalPaid.rows[0].paid);

    if (parseFloat(amount) > remain + 0.01) {
      return res.status(400).json({ error: `المبلغ (${amount} ر) أكبر من المتبقي (${remain.toFixed(2)} ر)` });
    }

    const result = await pool.query(
      `INSERT INTO payments (order_id, amount, method, collector_id, collector_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, amount, method, req.user.id, req.user.full_name, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في تسجيل الدفعة' });
  }
});

// ─── GET /api/orders/:id/payments ──────────────────────────
router.get('/:id/payments', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.full_name AS collector_name
       FROM payments p LEFT JOIN users u ON p.collector_id = u.id
       WHERE p.order_id = $1 ORDER BY p.created_at`,
      [req.params.id]
    );
    const totals = await pool.query(
      `SELECT o.grand_total, COALESCE(SUM(p.amount),0) AS total_paid
       FROM orders o LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1 GROUP BY o.grand_total`,
      [req.params.id]
    );
    res.json({
      payments: result.rows,
      grand_total: totals.rows[0]?.grand_total || 0,
      total_paid:  totals.rows[0]?.total_paid  || 0,
      remaining:   (parseFloat(totals.rows[0]?.grand_total || 0) - parseFloat(totals.rows[0]?.total_paid || 0)).toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب الدفعات' });
  }
});

module.exports = router;
