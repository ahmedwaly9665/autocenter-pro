-- ============================================================
-- AutoCenter Pro - قاعدة البيانات الكاملة
-- ============================================================

-- تفعيل UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. إعدادات النظام
-- ============================================================
CREATE TABLE system_settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES
  ('company_name',   'AutoCenter Pro'),
  ('vat_rate',       '15'),
  ('currency',       'SAR'),
  ('admin_password', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'), -- admin1234
  ('zatca_tax_number','300000000000003'),
  ('zatca_env',      'sandbox'),
  ('logo_url',       ''),
  ('logo_bg_color',  '#185FA5');

-- ============================================================
-- 2. الفروع
-- ============================================================
CREATE TABLE branches (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  city       VARCHAR(100),
  address    TEXT,
  phone      VARCHAR(30),
  manager_name VARCHAR(100),
  status     VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO branches (name, city, manager_name) VALUES
  ('فرع العليا',   'الرياض', 'وائل ناصر الغامدي'),
  ('فرع النسيم',   'الرياض', 'محمد الأحمدي'),
  ('فرع الملز',    'الرياض', 'سعد القرني'),
  ('فرع الروضة',   'جدة',    'فهد البلوي'),
  ('فرع النزهة',   'جدة',    'عبدالرحمن الشهري'),
  ('فرع الشاطئ',   'الدمام', 'أحمد السيد');

-- ============================================================
-- 3. المستخدمون
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(60)  UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(30)  NOT NULL CHECK (role IN ('super_admin','branch_manager','accountant','technician')),
  branch_id     INT REFERENCES branches(id) ON DELETE SET NULL,
  national_id   VARCHAR(20),
  phone         VARCHAR(20),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- كلمة مرور الكل: admin1234
INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES
  ('admin',      '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'مدير الفروع الرئيسي',   'super_admin',    NULL),
  ('mgr_eliaa',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'وائل ناصر الغامدي',     'branch_manager', 1),
  ('acc_eliaa',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'عبدالرحمن الشهري',      'accountant',     1),
  ('tech_eliaa', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'أحمد محمد السيد',       'technician',     1),
  ('mgr_naseem', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'محمد الأحمدي',          'branch_manager', 2),
  ('tech_naseem','$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'سعد علي القرني',        'technician',     2);

-- ============================================================
-- 4. الموظفون
-- ============================================================
CREATE TABLE employees (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  national_id  VARCHAR(20),
  job_title    VARCHAR(100),
  branch_id    INT REFERENCES branches(id) ON DELETE SET NULL,
  base_salary  NUMERIC(10,2) DEFAULT 0,
  phone        VARCHAR(20),
  status       VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','leave','inactive')),
  hire_date    DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO employees (name, national_id, job_title, branch_id, base_salary, status) VALUES
  ('أحمد محمد السيد',    '1099887766', 'فني أول',    1, 4500, 'active'),
  ('سعد علي القرني',     '1088776655', 'فني',         2, 3800, 'active'),
  ('محمد خالد الدوسري',  '1077665544', 'استقبال',     4, 3200, 'active'),
  ('عبدالرحمن الشهري',   '1066554433', 'محاسب',       1, 5500, 'active'),
  ('فهد عمر البلوي',     '1055443322', 'فني',         4, 4000, 'leave'),
  ('وائل ناصر الغامدي',  '1044332211', 'مدير فرع',    1, 7200, 'active');

-- ============================================================
-- 5. كشف المرتبات والتعديلات
-- ============================================================
CREATE TABLE salary_adjustments (
  id            SERIAL PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month         VARCHAR(7) NOT NULL,  -- YYYY-MM
  adj_type      VARCHAR(20) NOT NULL CHECK (adj_type IN ('bonus','deduction')),
  amount        NUMERIC(10,2) NOT NULL,
  reason        TEXT,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. الموردون
-- ============================================================
CREATE TABLE suppliers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  category     VARCHAR(100),
  contact_name VARCHAR(100),
  phone        VARCHAR(30),
  tax_id       VARCHAR(30),
  rating       INT DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  lead_days    INT DEFAULT 3,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO suppliers (name, category, lead_days, rating) VALUES
  ('شركة الخليج للقطع',  'قطع متعددة',   2, 5),
  ('توتال السعودية',     'زيوت وسوائل',  1, 5),
  ('بوش السعودية',       'إلكترونيات',   3, 4),
  ('NGK Japan',          'شمعات وفلاتر', 5, 4);

-- ============================================================
-- 7. قطع الغيار والمخزون
-- ============================================================
CREATE TABLE parts_inventory (
  id           SERIAL PRIMARY KEY,
  part_name    VARCHAR(200) NOT NULL,
  category     VARCHAR(100),
  supplier_id  INT REFERENCES suppliers(id) ON DELETE SET NULL,
  branch_id    INT REFERENCES branches(id) ON DELETE CASCADE,
  buy_price    NUMERIC(10,2) DEFAULT 0,
  sell_price   NUMERIC(10,2) DEFAULT 0,
  stock_qty    INT DEFAULT 0,
  min_qty      INT DEFAULT 5,   -- تنبيه عند الوصول لهذا الحد
  unit         VARCHAR(30) DEFAULT 'قطعة',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO parts_inventory (part_name, category, supplier_id, branch_id, buy_price, sell_price, stock_qty, min_qty) VALUES
  ('تيل فرامل أمامي',  'فرامل',  1, 1,  45,   120,  84, 10),
  ('فلتر زيت',          'زيوت',   2, 1,  18,   65,  210, 20),
  ('حزام التوقيت',      'محرك',   3, 1, 380,   850,  12,  5),
  ('فلتر هواء',         'فلاتر',  1, 1,  35,    95,   3,  5),
  ('شمعات إشعال NGK',  'كهرباء', 4, 1,  28,    85, 156, 15);

-- ============================================================
-- 8. السيارات
-- ============================================================
CREATE TABLE vehicles (
  id            SERIAL PRIMARY KEY,
  plate_number  VARCHAR(30) NOT NULL,
  license_no    VARCHAR(30),
  owner_name    VARCHAR(150) NOT NULL,
  owner_phone   VARCHAR(30),
  car_type      VARCHAR(100),
  car_year      SMALLINT,
  branch_id     INT REFERENCES branches(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicles_plate ON vehicles(plate_number);
CREATE INDEX idx_vehicles_license ON vehicles(license_no);
CREATE INDEX idx_vehicles_owner ON vehicles(owner_name);

-- ============================================================
-- 9. طلبات الصيانة (الأوردرات)
-- ============================================================
CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  order_ref       VARCHAR(20) UNIQUE NOT NULL,  -- #4821
  vehicle_id      INT NOT NULL REFERENCES vehicles(id),
  branch_id       INT NOT NULL REFERENCES branches(id),
  technician_id   INT REFERENCES employees(id) ON DELETE SET NULL,
  created_by      INT REFERENCES users(id),
  status          VARCHAR(30) DEFAULT 'open'
                  CHECK (status IN ('open','waiting_part','completed','cancelled')),
  km_reading      INT,
  problem_desc    TEXT,
  total_buy       NUMERIC(10,2) DEFAULT 0,
  total_sell      NUMERIC(10,2) DEFAULT 0,
  vat_amount      NUMERIC(10,2) DEFAULT 0,
  grand_total     NUMERIC(10,2) DEFAULT 0,
  is_deleted      BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  deleted_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_orders_vehicle ON orders(vehicle_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- ============================================================
-- 10. قطع الغيار لكل طلب
-- ============================================================
CREATE TABLE order_parts (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  part_name   VARCHAR(200) NOT NULL,
  qty         INT DEFAULT 1,
  buy_price   NUMERIC(10,2) DEFAULT 0,
  sell_price  NUMERIC(10,2) DEFAULT 0,
  vat         NUMERIC(10,2) DEFAULT 0,
  total       NUMERIC(10,2) DEFAULT 0
);

-- ============================================================
-- 11. سجل تعديلات الطلبات (Audit Trail)
-- ============================================================
CREATE TABLE order_edits (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  edited_by     INT NOT NULL REFERENCES users(id),
  field_changed VARCHAR(100),
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. طلبات الحذف
-- ============================================================
CREATE TABLE delete_requests (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  requested_by  INT NOT NULL REFERENCES users(id),
  reason        VARCHAR(200),
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  decided_by    INT REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. الدفعات والتحصيل
-- ============================================================
CREATE TABLE payments (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  method        VARCHAR(30) NOT NULL CHECK (method IN ('cash','card','transfer')),
  collector_id  INT REFERENCES users(id),
  collector_name VARCHAR(100),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- ============================================================
-- 14. المشتريات من الموردين
-- ============================================================
CREATE TABLE purchases (
  id           SERIAL PRIMARY KEY,
  supplier_id  INT NOT NULL REFERENCES suppliers(id),
  branch_id    INT NOT NULL REFERENCES branches(id),
  amount       NUMERIC(10,2) NOT NULL,
  vat          NUMERIC(10,2) DEFAULT 0,
  total        NUMERIC(10,2) NOT NULL,
  invoice_no   VARCHAR(100),
  purchase_date DATE DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. المصاريف التشغيلية
-- ============================================================
CREATE TABLE expenses (
  id           SERIAL PRIMARY KEY,
  branch_id    INT REFERENCES branches(id),
  category     VARCHAR(100),   -- إيجار، كهرباء، صيانة، إلخ
  amount       NUMERIC(10,2) NOT NULL,
  description  TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 16. الفواتير
-- ============================================================
CREATE TABLE invoices (
  id             SERIAL PRIMARY KEY,
  order_id       INT UNIQUE NOT NULL REFERENCES orders(id),
  invoice_type   VARCHAR(20) DEFAULT 'tax' CHECK (invoice_type IN ('tax','simple')),
  subtotal       NUMERIC(10,2),
  vat_amount     NUMERIC(10,2),
  total          NUMERIC(10,2),
  zatca_status   VARCHAR(20) DEFAULT 'pending' CHECK (zatca_status IN ('pending','sent','accepted','rejected')),
  zatca_uuid     VARCHAR(200),
  issued_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FUNCTION: تحديث updated_at تلقائياً
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branches_upd    BEFORE UPDATE ON branches    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_upd       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_upd   BEFORE UPDATE ON employees   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_upd   BEFORE UPDATE ON suppliers   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_parts_upd       BEFORE UPDATE ON parts_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_upd      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCTION: توليد رقم طلب تلقائي #4821 ...
-- ============================================================
CREATE SEQUENCE order_ref_seq START 4821;
CREATE OR REPLACE FUNCTION gen_order_ref() RETURNS TEXT AS $$
BEGIN RETURN '#' || nextval('order_ref_seq'); END;
$$ LANGUAGE plpgsql;
