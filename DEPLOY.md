# 🚀 دليل رفع AutoCenter Pro على Railway (مجاني)

## الوقت المطلوب: 15 دقيقة

---

## الخطوة 1 — تثبيت الأدوات على جهازك

### 1.1 تثبيت Node.js
- اذهب إلى: https://nodejs.org
- حمّل النسخة LTS (الأحدث)
- تثبيت عادي Next > Next > Finish

### 1.2 تثبيت Git
- اذهب إلى: https://git-scm.com/downloads
- تثبيت عادي، اقبل كل الإعدادات الافتراضية

### 1.3 تحقق من التثبيت
افتح Command Prompt أو Terminal واكتب:
```
node --version     → يجب أن تظهر v18 أو أحدث
git --version      → يجب أن تظهر نسخة git
```

---

## الخطوة 2 — إنشاء حساب GitHub

1. اذهب إلى: https://github.com
2. انقر "Sign up" وأنشئ حساباً مجانياً
3. تحقق من البريد الإلكتروني

---

## الخطوة 3 — رفع الكود على GitHub

افتح Terminal أو Command Prompt في مجلد المشروع:

```bash
# الدخول للمجلد
cd path/to/autocenter

# تهيئة Git
git init
git add .
git commit -m "AutoCenter Pro - النسخة الأولى"

# إنشاء Repository على GitHub
# اذهب إلى github.com → New Repository
# اسمه: autocenter-pro
# اتركه Public أو Private
# لا تضيف أي ملفات (لا README)

# ربط وترفيع الكود
git remote add origin https://github.com/YOUR_USERNAME/autocenter-pro.git
git branch -M main
git push -u origin main
```

---

## الخطوة 4 — إنشاء حساب Railway

1. اذهب إلى: https://railway.app
2. انقر "Start a New Project"
3. سجّل دخول بحساب GitHub (مهم - اربطه بنفس الحساب)
4. انقر "Authorize Railway"

---

## الخطوة 5 — إنشاء المشروع على Railway

### 5.1 إضافة قاعدة البيانات
1. في Railway Dashboard انقر "New Project"
2. اختر "Empty Project"
3. انقر "+ Add Service" → "Database" → "PostgreSQL"
4. انتظر حتى يكتمل الإنشاء (دقيقة واحدة)

### 5.2 ربط الكود
1. انقر "+ Add Service" مرة أخرى
2. اختر "GitHub Repo"
3. اختر "autocenter-pro" من القائمة
4. انقر "Deploy Now"

---

## الخطوة 6 — إضافة متغيرات البيئة

1. انقر على Service الخاص بكودك (مش الـ PostgreSQL)
2. اذهب لتبويب "Variables"
3. انقر "New Variable" وأضف:

| المفتاح | القيمة |
|---------|--------|
| DATABASE_URL | انقر على PostgreSQL → Variables → انسخ DATABASE_URL |
| JWT_SECRET | اكتب أي نص طويل عشوائي مثل: autocenter2026superSecretKey!XYZ |
| NODE_ENV | production |
| APP_NAME | AutoCenter Pro |

**لنسخ DATABASE_URL:**
- انقر على قاعدة البيانات PostgreSQL
- اذهب لتبويب "Variables"
- انسخ قيمة DATABASE_URL
- الصقها في Service الكود

---

## الخطوة 7 — تهيئة قاعدة البيانات

بعد ما يكتمل الـ Deploy:

1. انقر على Service الكود
2. اذهب لتبويب "Settings" → "Custom Domain" (هتلاقي رابطك هنا مثل: https://autocenter-pro.up.railway.app)
3. اذهب لتبويب "Deploy" → انقر "Deploy Logs"
4. إذا ظهر ✅ فالنظام شتغل

**اختبر الرابط:**
```
https://YOUR-APP.up.railway.app/api/health
```
يجب أن تظهر:
```json
{"status":"OK","version":"1.0.0","app":"AutoCenter Pro"}
```

---

## الخطوة 8 — الدخول للنظام

افتح الرابط وستظهر صفحة تسجيل الدخول:

```
اسم المستخدم: admin
كلمة المرور: admin1234
```

**⚠️ مهم: غيّر كلمة المرور فوراً بعد أول دخول**

---

## المستخدمون الافتراضيون

| اسم المستخدم | الدور | الفرع |
|-------------|-------|-------|
| admin | مدير الفروع الكامل | جميع الفروع |
| mgr_eliaa | مدير فرع | فرع العليا |
| acc_eliaa | حسابات | فرع العليا |
| tech_eliaa | فني | فرع العليا |
| mgr_naseem | مدير فرع | فرع النسيم |

**كلمة مرور الجميع: admin1234**

---

## الحدود المجانية في Railway

- RAM: 512MB (كافية لـ 50 مستخدم متزامن)
- Database: 1GB (كافية لآلاف الطلبات)
- Bandwidth: 100GB/شهر
- **ملاحظة:** النسخة المجانية تنام بعد 30 دقيقة بدون نشاط، وتصحى في ثوانٍ عند أول طلب

---

## بعد موافقة العميل → النسخة المدفوعة

| الخدمة | السعر | المميزات |
|--------|-------|---------|
| Railway Hobby | $5/شهر | لا نوم، أداء أفضل |
| Railway Pro | $20/شهر | موارد أكثر، SLA |
| VPS (Hetzner) | €5/شهر | سيرفر مخصص كامل |

---

## استكشاف الأخطاء

**مشكلة: لا يفتح الرابط**
- تحقق من Deploy Logs في Railway
- تأكد أن DATABASE_URL صحيح

**مشكلة: خطأ في قاعدة البيانات**
- تأكد أن PostgreSQL service شتغل (علامة خضراء)
- تأكد أن DATABASE_URL منسوخ صح

**مشكلة: صفحة الدخول لا تظهر**
- ملف public/index.html لازم يكون موجود
- تحقق من Build Logs

---

للمساعدة: راجع وثائق Railway على https://docs.railway.app
