# التقرير التحليلي لنظام التراخيص والاشتراكات — ما قبل الإطلاق التجاري

**التاريخ:** 30 يونيو 2026  
**النطاق:** تحليل فقط — **لا تنفيذ، لا إعادة بناء، لا تعديل على الكود**  
**الحالة الحالية:** Release Candidate — جاهزية 99% — Code Freeze قريب

---

## الملخص التنفيذي

النظام الحالي **جاهز للبيع التجاري اليوم** باستخدام نموذج **إصدار كامل (Full Edition)** و**إصدار مخصص (Custom Edition)** مع 72 خاصية مرخصة ولوحة مطور متقدمة.

**التوصية الرئيسية:**  
➡️ **تأجيل تنفيذ طبقة Packages الكاملة إلى الإصدار التالي (v2.1)** بعد الإطلاق التجاري و Code Freeze.  
➡️ **عدم المساس بنظام الترخيص الحالي قبل الإطلاق** — المخاطر أعلى من الفائدة في هذه المرحلة.

**ما يمكن تنفيذه بأمان بعد الإطلاق (Phase 2.1 — طبقة إضافية فقط):**
- ملف `license-packages.json` كمصدر للباقات الجاهزة
- واجهة "اختر الباقة" التي تملأ checkboxes الموجودة (`licCollectFeatureSelection`)
- تحسينات UX لنسخ المفتاح (Copy All / Export / ملخص أوضح)
- **بدون** تغيير خوارزمية التشفير أو `isFeatureEnabled`

---

## 1. ما هو موجود بالفعل — لا تُعاد بناؤه

| المكوّن | الحالة | الموقع |
|---------|--------|--------|
| `FEATURE_REGISTRY` (72 خاصية) | ✅ مكتمل | `index.html` |
| Feature Flags (`isFeatureEnabled`) | ✅ مكتمل | `index.html` |
| Edition System (full / custom) | ✅ مكتمل | `index.html` |
| DOM gating (`data-feature`) | ✅ ~46 بوابة | `index.html` |
| توليد/تحقق الأكواد (V3/V4/Legacy) | ✅ مكتمل | `index.html` |
| لوحة المطور + Diagnostics | ✅ مكتمل | `index.html` |
| `licToggleRuntimeFeature` (opt-in) | ✅ مكتمل | `index.html` |
| HMAC + featureSig للإصدار المخصص | ✅ مكتمل | `index.html` |
| صلاحيات RBAC منفصلة | ✅ مكتمل | `cupping-ext-modules.js` |
| Lazy load (Product Tour فقط) | ✅ مكتمل | `cupping-first-run.js` |

**الخلاصة:** البنية التحتية قوية وقابلة للبيع. المطلوب لاحقًا هو **طبقة تجارية (Commercial Layer)** فوق الموجود، وليس نظامًا بديلًا.

---

## 2. هندسة النظام الحالي (كما هي)

```
ترخيص مخزّن (localStorage)
        ↓
licResolveLicensedFeatures()
        ↓
_licenseEdition + _licensedFeatures
        ↓
isFeatureEnabled(featureId)
        ↓
┌──────────────────┬────────────────────┬─────────────────────┐
│ applyLicensed    │ isPageEnabled()    │ isFeatureEnabled()  │
│ Features (DOM)   │ (module gate)      │ (inline logic)      │
└──────────────────┴────────────────────┴─────────────────────┘
```

### أنواع المفاتيح

| الصيغة | الطول | الاستخدام | يحمل features؟ |
|--------|-------|-----------|----------------|
| **V4** (`TDWI2-…`) | **25 حرف** | إصدار كامل | ❌ لا |
| **V3** | 80–200+ حرف | إصدار مخصص | ✅ نعم (JSON مشفّر) |
| Legacy | متغير | توافق قديم | ✅ |

**سبب طول الكود عند اختيار خصائص معينة:**  
عند تفعيل **Custom Edition**، النظام **يُجبر** استخدام V3 لأن V4 (75-bit فقط) لا يتسع لخريطة 64 خاصية. الـ payload يصبح: JSON موقّع + HMAC + XOR + Base32 → مفتاح طويل مثل `A7FC8-3TDKP-…`.

**الإصدار الكامل** يستخدم V4 القصير (`TDWI2-XXXXX-…`) — **25 حرفًا** — وهذا احترافي بالفعل.

---

## 3. جرد كامل للخصائص (72)

### 3.1 Core — دائمًا مفعّل (8)

| Key | الوحدة | الصفحة | التصنيف |
|-----|--------|--------|---------|
| `core_dashboard` | dashboard | لوحة التحكم | Core |
| `core_pos` | daily | السجل اليومي | Core |
| `core_clients` | clients | العملاء | Core |
| `core_staff` | doctors | الموظفين/أخصائيين | Core |
| `core_packages` | packages | الباقات والأسعار | Core |
| `core_users` | users | المستخدمين | Core |
| `core_settings` | settings | الإعدادات | Core |
| `core_employee` | employee | بوابة الموظف | Core |

### 3.2 Add-ons — قابلة للترخيص (64)

| Key | المجموعة | الوحدة | واجهة | يعمل | بوابة DOM | ملاحظات |
|-----|----------|--------|-------|------|-----------|---------|
| `book_schedule` | patients_visits | bookings | ✅ | ✅ | جزئي | module-level |
| `book_confirm` | patients_visits | bookings | ✅ | ✅ | ❌ | يُفعّل مع bookings |
| `book_no_show` | patients_visits | bookings | ✅ | ✅ | ❌ | يُفعّل مع bookings |
| `dash_book_kpi` | patients_visits | dashboard | ✅ | ✅ | ✅ | |
| `pos_shared_pkg` | patients_visits | daily | ✅ | ✅ | ✅ | ⭐ فريدة |
| `pos_multi_svc` | patients_visits | daily | ✅ | ✅ | ✅ | |
| `pos_receipt` | patients_visits | daily | ✅ | ✅ | ✅ | |
| `msg_templates` | patients_visits | messages | ✅ | ✅ | ✅ | |
| `msg_bulk` | patients_visits | messages | ✅ | ✅ | ✅ | |
| `msg_auto` | patients_visits | messages | ✅ | ✅ | ✅ | ⭐ |
| `msg_retention` | patients_visits | dashboard | ✅ | ✅ | ✅ | |
| `dash_msg_alert` | patients_visits | dashboard | ✅ | ✅ | ✅ | |
| `crm_invoice_search` | patients_visits | clients | ✅ | ✅ | ✅ | |
| `crm_search` | patients_visits | search | ⚠️ مخفية | ⚠️ | ✅ | **يتيمة** — مدمجة في clients |
| `ops_client_file` | patients_visits | clients | ✅ | ✅ | ✅ | ⭐ |
| `ops_map_editor` | patients_visits | settings | ✅ | ✅ | ⚠️ | يُربط بـ `ops_client_file` |
| `rep_monthly` | reports_print | reports | ✅ | ✅ | ✅ | |
| `rep_doctors` | reports_print | reports | ✅ | ✅ | ✅ | |
| `rep_vat` | reports_print | reports | ✅ | ✅ | ✅ | |
| `rep_zreport` | reports_print | dashboard | ✅ | ✅ | ✅ | |
| `rep_profitability` | reports_print | reports | ✅ | ✅ | ✅ | |
| `rep_sales` | reports_print | reports | ✅ | ✅ | inline | |
| `rep_thermal_period` | reports_print | reports | ✅ | ✅ | ✅ | |
| `rep_archive_a4` | reports_print | reports | ✅ | ✅ | ✅ | ⭐ Add-on |
| `tech_print_pdf` | reports_print | reports | ✅ | ✅ | class | |
| `exp_track` | advanced | expenses | ✅ | ✅ | ✅ | |
| `exp_budget` | advanced | expenses | ✅ | ✅ | ✅ | |
| `dash_exp_kpi` | advanced | dashboard | ✅ | ✅ | ✅ | |
| `pkg_bank` | advanced | packages | ✅ | ✅ | ✅ | ⭐ |
| `fin_currency` | advanced | daily | ✅ | ✅ | ✅ | ⭐ |
| `fin_cashfloat` | advanced | cashfloat | ✅ | ✅ | ✅ | |
| `ops_inventory` | advanced | inventory | ✅ | ✅ | ✅ | ⭐ |
| `att_daily` | hr_payroll | attendance | ✅ | ✅ | ❌ | module-level |
| `att_leave` | hr_payroll | attendance | ✅ | ✅ | ✅ | |
| `hr_leave_requests` | hr_payroll | attendance | ✅ | ✅ | ✅ | |
| `att_overtime` | hr_payroll | attendance | ✅ | ✅ | ✅ | |
| `pay_salary` | hr_payroll | payroll | ✅ | ✅ | ❌ | module-level |
| `pay_commission` | hr_payroll | payroll | ✅ | ✅ | ❌ | ⭐ |
| `hr_ledger` | hr_payroll | payroll | ✅ | ✅ | ✅ | ⭐ |
| `att_report` | hr_payroll | attendance | ✅ | ✅ | ✅ | |
| `att_policy` | hr_payroll | attendance | ✅ | ✅ | ✅ | ⭐ |
| `pkg_commissions` | hr_payroll | packages | ✅ | ✅ | ✅ | |
| `hw_drawer` | developer_tools | settings | ✅ | ✅ | ✅ | |
| `hw_thermal` | developer_tools | settings | ✅ | ✅ | ✅ | |
| `hw_status` | developer_tools | dashboard | ✅ | ✅ | ✅ | |
| `bk_local` | backup_restore | settings | ✅ | ✅ | ✅ | |
| `bk_custom` | backup_restore | settings | ✅ | ✅ | ✅ | |
| `bk_cloud` | backup_restore | settings | ✅ | ✅ | ✅ | |
| `bk_drive` | backup_restore | settings | ✅ | ✅ | ✅ | ⭐ |
| `tech_import` | developer_tools | settings | ✅ | ✅ | ✅ | ⭐ |
| `tech_msg_api` | communication | settings | ✅ | ✅ | ❌ | |
| `tech_gateway` | communication | settings | ⚠️ | ✅ | ❌ | لوحة مطور فقط |
| `hr_leave_balance` | hr_payroll | archive | ✅ | ✅ | ❌ | تقرير أرشيف فقط |
| `sys_setup_wizard` | diagnostics | settings | ✅ | ✅ | ✅ | |
| `sys_product_tour` | diagnostics | lazy | ✅ | ✅ | ✅ | **Opt-in** |
| `sys_health_check` | diagnostics | settings | ✅ | ✅ | ✅ | يُقترح Opt-in |
| `sys_readiness` | diagnostics | dashboard | ✅ | ✅ | ✅ | |
| `sys_integrity` | diagnostics | settings | ✅ | ✅ | جزئي | يُقترح Opt-in |
| `sys_logs` | developer_tools | logs | ✅ | ✅ | ✅ | |
| `lux_queue_board` | advanced | dashboard | ✅ | ✅ | ✅ | |
| `lux_queue_print` | advanced | dashboard | ✅ | ✅ | ✅ | ⭐ |
| `lux_queue_display` | advanced | dashboard | ✅ | ✅ | ✅ | |
| `lux_vip` | advanced | daily | ✅ | ✅ | ✅ | |
| `lux_rush` | advanced | daily | ✅ | ✅ | ✅ | ⭐ |

---

## 4. تصنيف الخصائص المقترح

| التصنيف | الوصف | أمثلة |
|---------|-------|-------|
| **Core** | أساس كل باقة — غير قابل للبيع منفصلًا | `core_*` (8) |
| **Standard** | تشغيل يومي لمركز صغير–متوسط | حجوزات، رسائل أساسية، تقارير شهرية |
| **Professional** | HR + مالية + تقارير متقدمة | رواتب، حضور، أرشيف، عمولات |
| **Enterprise** | عمليات متقدمة + تكامل | مخزون، Drive، Gateway، استيراد |
| **Optional Add-on** | يُباع منفصلًا | Product Tour، أرشيف شهري، SMS API |
| **Developer** | أدوات مطور/صيانة | Gateway، سجلات، integrity |
| **Diagnostics** | تشخيص وجاهزية | Health Check، Readiness، Integrity |
| **Internal / Opt-in** | معطّلة افتراضيًا حتى في Ultimate | `sys_product_tour` + المقترح أدناه |

### يجب أن تبقى Opt-in فقط (حتى في Ultimate)

| Key | السبب |
|-----|-------|
| `sys_product_tour` | ✅ موجود — lazy load |
| `sys_health_check` | تشخيص — لا يحتاجه العميل يوميًا |
| `sys_integrity` | صيانة بيانات — خطر في يد المستخدم |
| `tech_gateway` | أدوات مطور — تفعيل يدوي |
| `sys_logs` (اختياري) | يمكن إبقاؤها في Enterprise مع تقييد صلاحية |

---

## 5. الباقات المقترحة (`license-packages.json`)

### Starter — مراكز صغيرة

**السعر المقترح:** نقطة دخول تجارية  
**الأجهزة:** 1 | **الفروع:** 1

| المجموعة | الخصائص |
|----------|---------|
| Core (كلها) | 8 core |
| تشغيل | `book_schedule`, `pos_receipt`, `rep_monthly`, `rep_vat`, `rep_zreport` |
| رسائل أساسية | `msg_templates` |
| نسخ | `bk_local` |
| أجهزة | `hw_thermal` |

**عدد Add-ons تقريبي:** ~18 من 64

---

### Standard — Starter +

| إضافة | الخصائص |
|-------|---------|
| HR أساسي | `att_daily`, `att_leave`, `att_report`, `pay_salary` |
| نسخ متقدم | `bk_custom` |
| تقارير | `rep_doctors`, `rep_profitability`, `tech_print_pdf` |
| عملاء | `crm_invoice_search`, `pos_multi_svc` |
| إعداد | `sys_setup_wizard` |

**الأجهزة:** 2 | **الفروع:** 1

---

### Professional — Standard +

| إضافة | الخصائص |
|-------|---------|
| HR متقدم | `hr_leave_requests`, `att_policy`, `att_overtime`, `pay_commission`, `hr_ledger`, `pkg_commissions` |
| مالية | `exp_track`, `exp_budget`, `fin_cashfloat`, `pkg_bank` |
| تقارير | `rep_archive_a4`, `rep_sales`, `rep_thermal_period` |
| عمليات | `ops_client_file`, `msg_bulk`, `msg_auto`, `msg_retention` |
| نسخ | `bk_cloud` |

**الأجهزة:** 3 | **الفروع:** 2

---

### Enterprise — Professional +

| إضافة | الخصائص |
|-------|---------|
| متقدم | `ops_inventory`, `fin_currency`, `bk_drive`, `tech_import` |
| تكامل | `tech_msg_api` |
| Queue | `lux_queue_board`, `lux_queue_print`, `lux_queue_display` |
| VIP | `lux_vip`, `lux_rush`, `pos_shared_pkg` |
| تشخيص | `sys_readiness` |
| سجلات | `sys_logs` |
| أجهزة | `hw_drawer`, `hw_status` |

**الأجهزة:** 5 | **الفروع:** 5

---

### Ultimate — كل شيء ما عدا Opt-in

= Enterprise + جميع الـ 64 add-on **ما عدا** Opt-in list  
Opt-in تبقى معطّلة حتى يفعّلها المطور يدويًا.

**الأجهزة:** غير محدود | **الفروع:** غير محدود

---

### Custom Package

اختيار يدوي من `FEATURE_REGISTRY` — **يستخدم نفس `licCollectFeatureSelection()` الحالي**.

---

## 6. Add-ons مستقلة للبيع المنفصل

| Add-on | Key | السبب التجاري |
|--------|-----|---------------|
| Product Tour | `sys_product_tour` | تدريب — opt-in |
| Health Check | `sys_health_check` | تشخيص |
| Integrity Tools | `sys_integrity` | صيانة |
| Monthly Archive A4 | `rep_archive_a4` | محاسبة شهرية |
| Backup Pro | `bk_drive` + `bk_cloud` | سحابة |
| SMS/WhatsApp API | `tech_msg_api` | رسائل خارجية |
| Communication Gateway | `tech_gateway` | تكامل مطور |
| Map Editor | `ops_map_editor` | تخصص طبي |
| Queue Display | `lux_queue_display` | عيادات مزدحمة |
| Multi-Branch *(مستقبلي)* | — | **غير موجود بعد** — metadata فقط |

---

## 7. التصميم المعماري المقترح — Extension Layer

```
license-packages.json          ← جديد (config فقط)
        ↓
PackageProfileResolver         ← جديد (thin layer)
        ↓
lic.features + edition         ← موجود
        ↓
FEATURE_REGISTRY / isFeatureEnabled  ← بدون تغيير
        ↓
النظام
```

**قواعد صارمة:**
- لا تغيير في `isFeatureEnabled` logic
- لا تغيير في `FEATURE_REGISTRY` IDs
- الباقة = preset لـ `features` object
- Custom = نفس الواجهة الحالية

---

## 8. أنواع الاشتراك — الربط بالموجود

| النوع المطلوب | الحالة في النظام | `lic-gen-type` |
|---------------|------------------|----------------|
| Trial | ✅ | `trial` (7 أيام) |
| Demo | ⚠️ | يمكن إضافة كـ alias لـ trial |
| Monthly | ✅ | `monthly` |
| Quarterly | ✅ | `quarterly` |
| Semi Annual | ✅ | `biannual` |
| Annual | ✅ | `annual` |
| Two Years | ⚠️ | `custom` + 730 يوم |
| Three Years | ⚠️ | `custom` + 1095 يوم |
| Lifetime | ⚠️ | `custom` + تاريخ بعيد |
| Internal | ⚠️ | metadata في packages.json |
| Developer | ⚠️ | metadata + `isDev` user |

**التوصية:** إضافة أنواع الاشتراك الناقصة في `license-packages.json` فقط — بدون تغيير V4 codec.

---

## 9. تحسين نظام الأكواد — التحليل والمقترح

### المشكلة
Custom Edition → V3 طويل لأن **64-bit feature map لا تدخل في 75-bit V4**.

### الحلول الممكنة (مقارنة)

| الحل | الطول | الأمان | التعقيد | التوصية |
|------|-------|--------|---------|---------|
| **A. الإبقاء على الوضع الحالي** | V4=25 / V3=طويل | جيد | منخفض | ✅ للإطلاق |
| **B. V5: License ID + MAC قصير** | ~25 حرف | ممتاز | متوسط | ✅ v2.1 |
| **C. خادم تفعيل (Activation Server)** | قصير جدًا | الأفضل | عالي | v3.0 |
| **D. ضغط bitmap في V4** | ~35 حرف | جيد | عالي | غير موصى به |

### المقترح المعماري V5 (للإصدار القادم)

```
TDWI2-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX  (25 حرف)
│      │                              │
│      └── License ID (16-bit)       └── HMAC truncated
└── Magic

features + package + devices + branches → تُخزّن في:
  • localStorage بعد التفعيل الأول
  • أو سجل تراخيص مركزي (اختياري مستقبلًا)
```

**عند التفعيل:**
1. العميل يُدخل مفتاحًا قصيرًا
2. النظام يتحقق من MAC + License ID
3. يجلب **Package Profile** من `license-packages.json` أو من سجل مُسبق التوليد
4. يطبق `features` عبر `licAttachFeaturesToLicense()` **الموجود**

**المزايا:** أكواد قصيرة لكل الباقات بما فيها Custom (عبر License ID مسجّل).  
**العيوب:** يتطلب **سجل تراخيص** عند التوليد (ملف JSON محلي للمطور أو خادم لاحقًا).

---

## 10. واجهة إنشاء الترخيص — الوضع الحالي والمقترح

### موجود اليوم (`licGenerateRenewalCode`)
- ✅ مربع مفتاح واضح
- ✅ زر Copy
- ✅ نوع الترخيص + الإصدار + التواريخ + الجهاز
- ✅ يُظهر صيغة V4/V3

### المقترح (UX فقط — v2.1)
- زر **Copy All** (مفتاح + ملخص)
- زر **Export** (JSON/PDF للعميل)
- عدد الأحرف
- ملخص قبل التوليد:

```
Package: Professional
License Type: Annual
Edition: Custom (43 features)
Add-ons: 5
Devices: 3 | Branches: 2
Expiration: 31-12-2027
```

- اختيار الباقة: Starter | Standard | … | Custom

---

## 11. خصائص يتيمة / مكررة / تحتاج قرار

| Key | المشكلة | التوصية |
|-----|---------|---------|
| `crm_search` | صفحة مخفية | إزالة من البيع — دمج في clients |
| `ops_map_editor` | يُفعّل عبر `ops_client_file` | دمج تجاري مع client file |
| `book_confirm` / `book_no_show` | بدون gate منفصل | دمج مع `book_schedule` في الباقات |
| `att_daily` | module-level فقط | إضافة `data-feature` لاحقًا (v2.1) |
| `tech_gateway` | بدون gate | ربط بـ Developer role + opt-in |
| `hr_ledger` | الصفحة غير مربوطة بـ feature | إضافة page gate (bug fix منفصل) |

**لا تُعالج قبل الإطلاق** — ليست حرجة للبيع بإصدار كامل.

---

## 12. المراجعة الهندسية

### نقاط القوة 💪
- نموذج تجاري granular (64 add-on)
- فصل License vs RBAC
- V4 قصير للإصدار الكامل
- HMAC + featureSig anti-tamper
- لوحة مطور غنية
- Legacy bundle migration
- Opt-in tour pattern صحيح

### نقاط الضعف ⚠️
- أمان client-side (secrets في المصدر)
- JS modules تُحمّل كلها (ما عدا tour)
- Module gate = OR وليس AND
- ~15 add-on بدون `data-feature` DOM
- Custom = مفتاح طويل دائمًا
- لا مفهوم devices/branches في الترخيص بعد

### فرص التحسين (بعد الإطلاق)
- `license-packages.json`
- V5 License ID model
- Lazy load لوحدات إضافية (inventory, archive, gateway)
- Activation server (اختياري)
- توحيد DOM gates

---

## 13. تقدير العمل والمخاطر

| المرحلة | المحتوى | المخاطر | التأثير على RC |
|---------|---------|---------|----------------|
| **Phase 0 — الإطلاق الآن** | Full + Custom كما هو | منخفض | ✅ لا تأثير |
| **Phase 2.1** | `license-packages.json` + UI picker + UX copy | منخفض | آمن بعد Code Freeze |
| **Phase 2.2** | V5 short keys + license registry | متوسط | يتطلب اختبار ترخيص شامل |
| **Phase 3** | Activation server + multi-branch | عالي | إصدار رئيسي جديد |

**حجم العمل التقريبي:**
- Phase 2.1: ~3–5 أيام تطوير + 2 يوم اختبار
- Phase 2.2: ~1–2 أسبوع
- Phase 3: ~3–4 أسابيع

---

## 14. التوصية النهائية

### قبل الإطلاق التجاري (الآن)
| القرار | التوصية |
|--------|---------|
| تنفيذ Packages | ❌ **لا** |
| تغيير نظام الأكواد | ❌ **لا** |
| إعادة بناء Feature Flags | ❌ **لا** |
| البيع التجاري | ✅ **نعم** — بإصدار كامل + مخصص |
| نموذج البيع | Full Edition = V4 قصير / Custom = V3 |

### بعد الإطلاق (v2.1 — Code Freeze)
1. إضافة `license-packages.json`
2. واجهة Choose Package (طبقة فوق الموجود)
3. تحسين UX النسخ والتصدير
4. توثيق تجاري للباقات

### الإصدار التالي (v2.2+)
1. V5 License ID + سجل تراخيص
2. Devices/Branches كـ metadata
3. تحسين DOM gates للـ 15 add-on الناقصة

---

## 15. الخلاصة

النظام الحالي **ليس بحاجة لإعادة بناء**. هو **جاهز للبيع** بنموذج:
- **إصدار كامل** → مفتاح قصير 25 حرف (V4)
- **إصدار مخصص** → مفتاح طويل (V3) — مقبول تجاريًا للعملاء Enterprise

طبقة **Packages** المقترحة **تصميم صحيح ومنطقي**، لكن **تأجيلها للإصدار التالي** يحافظ على:
- استقرار RC (99%)
- Code Freeze نظيف
- عدم إدخال مخاطر regression في الترخيص قبل أول عميل

**الخطوة التالية الموصى بها:** الإطلاق التجاري → Code Freeze → Phase 2.1 Packages Layer.

---

*هذا التقرير تحليلي فقط. لم يُجرَ أي تعديل على كود الترخيص أو Feature Flags.*
