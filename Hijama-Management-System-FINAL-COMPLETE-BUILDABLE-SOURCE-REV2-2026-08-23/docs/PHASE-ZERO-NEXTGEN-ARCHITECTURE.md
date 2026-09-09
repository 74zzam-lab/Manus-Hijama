# Tadawi Next Generation — Phase Zero Architecture Report

**الحالة:** وثيقة تصميم فقط — **لا تنفيذ كود حتى موافقة المالك**  
**المنتج:** Tadawi Al-Madinah / Hijama Management System v2.0.0  
**قاعدة الاستقرار (RC3 Stable Base):** فرع العمل الحالي `cursor/phase-20-windows-compat-c2ea` (بعد مراحل 1–20)  
**التاريخ:** 2026-07-28  
**النوع:** Architecture Proposal (Phase Zero)

---

## 0. الخلاصة التنفيذية

النظام الحالي **ليس صفحة بيضاء**. هو بالفعل منصة محلية-أولاً (Local-First) متعددة الأجهزة/الفروع على مستوى **مركز واحد (Center ID)**، مع:

- ترخيص تجاري V5/V6 + تفعيل لمرة واحدة + `license.json` على Drive  
- BootFlow (عميل جديد / عميل حالي)  
- Login داخلي User/Pass + RBAC  
- Cloud V2 (Repository / SyncEngine / BranchScope / DeviceRegistry)  
- Owner Hub **تشغيلي/تشخيصي** (Phase 19) — بدون تقارير مالية عبر الفروع  

الرؤية المطلوبة (Organization + Owner واحد + فروع + أجهزة + Owner Hub مركزي) **متوافقة في الاتجاه** مع Cloud V2، لكن بعض بنود الرؤية تتعارض لفظياً مع قيودك أنت («ممنوع تغيير Boot/Login/Startup») ومع مبادئ Cloud V2 (خصوصاً **P6: Google ≠ Login**).

### القرار المعماري المقترح (قبل أي كود)

| مفهوم الرؤية | المكافئ الحالي | القرار الجراحي |
|--------------|----------------|----------------|
| Organization | `Center ID` (`NJR-CLINIC-…`) | **إعادة تسمية مفاهيمية + حقول عرض** — لا معرف موازٍ في المراحل الأولى |
| License | `LicenseCloud` + `__tdw_lic__` + Engine V2/V6 | توسيع حقول/حدود فقط — لا إعادة كتابة المحرك |
| Owner | `RolePolicy` (`owner` ≈ manager) + `ownerIdentity` (Google) | **طبقة Owner Profile** فوق المستخدمين — Owner ≠ Admin تشغيلياً دون كسر RBAC |
| Branch | `license.json.branches` + `BranchScope` + `BranchEnrollment` | بوابة إنشاء الفروع من Owner Hub فقط |
| Device | `DeviceConfig` + `DeviceRegistry` | تفعيل حد الأجهزة من الباقة (اليوم غير مفعّل فعلياً) |
| Users/Roles | `admin/reception/employee/accountant/custom` | تبقى؛ `owner` يُفعَّل كدور مؤسسي منفصل عن Admin الفرع |
| Google | ربط سحابة + هوية ترخيص | يبقى **وسيط مزامنة** — ليس دخول موظفين |
| Owner Hub | `cloud/owner-hub.js` ops/diagnostics | توسيع تدريجي: Branches/Devices/Licensing ثم Reports عند الطلب |
| Reports Aggregation | مؤجّل صراحةً (Phase 19 / Cloud V2 §20) | طبقات ملخصات على Drive — **بدون** تنزيل كل قواعد الفروع |

**لا كود في هذه المرحلة.** التنفيذ يبدأ فقط بعد موافقتك على هذا التقرير والخطة ذات الـ 18 مرحلة أدناه.

---

## 1. دراسة المشروع بالكامل (الوضع الحالي)

### 1.1 طوبولوجيا التشغيل

```text
Renderer (index.html + cupping-*.js + cloud/ + license/)
   DB.get/DB.set → localStorage mirror
   SqliteBridge → SQLite dual-run (schema v4)
        │ IPC allowlist
Electron Main (electron/main.js)
   SQLite service · backup · OAuth · license shards · device cache
        │
userData ("Cupping Center") + Google Drive (Sync Mediator)
```

### 1.2 المكوّنات الرئيسية

| الطبقة | المسارات | الوظيفة |
|--------|----------|---------|
| UI Shell | `index.html` | Login، License Screen، Navigation، Startup، عمليات يومية |
| عمليات العيادة | `cupping-*.js` | عملاء، زيارات، حجوزات، رواتب، فواتير، حضور… |
| Cloud V2 | `cloud/*.js` (52 ملفاً) | Meta، License، Bootstrap، Sync، Branches، Owner Hub… |
| Licensing | `license/` + `tools/license-admin` | إصدار/تحقق V5+V6، باقات، تفعيل |
| Electron | `electron/` | أمن، IPC، Backup مشفّر، OAuth |
| DB | `database/` + `cupping-sqlite-bridge.js` | SQLite v4 + مرآة localStorage |
| بوابات الجودة | `scripts/*gate*.mjs`, `tests/baseline/*` | مراحل 1–20 |

### 1.3 ما أنجزته المراحل 1–20 (RC3)

| مرحلة | النتيجة |
|-------|---------|
| 1 | تثبيت خط الأساس + اختبارات ذهبية للمالية |
| 2 | أمن Electron (contextIsolation / sandbox / IPC) |
| 3 | Licensing V6 (Ed25519) مع إبقاء V5 |
| 4 | SQLite dual-run |
| 5–7 | أمن بيانات / صلاحيات / Backup |
| 8–11 | Dev panel / Branding / Wizard / Bookings |
| 12–17 | Build / Electron readiness / FPV / RC / Freeze / Evidence |
| 18 | حراسة الكتابة متعددة الفروع + تعارضات |
| 19 | Owner Hub تشخيصي (بدون KPI مالي عبر الفروع) |
| 20 | Production release gate + توافق Windows |

### 1.4 مفاتيح البيانات الحرجة

`__tdw_meta__`, `__tdw_cloud_license__`, `__tdw_device_config__`, `__tdw_lic__*`,  
`__tdw_boot_wizard__`, `__tdw_boot_complete__`, `__tdw_sync_state__`,  
`__tdw_active_branch__` (session), `commercial_license_data_v2`, `commercial_license_v6`,  
جداول متزامنة: `cases`, `clientsRegistry`, `bookings`, `users`, `settings`, …

---

## 2. فهم الأنظمة الحالية (التدفقات)

### 2.1 BootFlow الحالي (`cloud/boot-flow-ui.js`)

**عميل جديد:**  
`license → google → center → branch → manager → syscheck → login`

**عميل حالي / جهاز إضافي:**  
`google → device_branch → login`

ملاحظات:

- المسار موجود ومتكامل مع `LicenseActivationGate` و `CloudBootstrap`.
- خطوة `manager` تتحقق عبر `RolePolicy.hasManagerAccount` (admin/owner/hq_admin) — **ليست** شاشة Owner الحصرية في رؤيتك.
- إنشاء الفرع الأول يحدث أثناء Boot/CenterSetup — بينما رؤيتك تريد إنشاء الفروع **فقط من Owner Hub**.

### 2.2 Login الحالي (`doLogin` في `index.html`)

1. تجاوز المطوّر `DEV_ACCOUNT` (عند الحاجة)  
2. بوابة الترخيص: `blocked` / `expired|none` / `valid`  
3. عند `expired|none`: موظف فقط (قراءة)  
4. بعد النجاح: `BranchScope.initSessionBranch` → `applyRoleUI` → `init()`

**Google ليس دخول موظفين** (مبدأ P6) — الربط عبر Boot/Settings فقط.

### 2.3 Startup الحالي

`ensureLoginAccessible` → wipe اختياري → `licCheck` (بمهلة) → CloudV2.init → جلسة سابقة أو شاشة دخول.  
أي تعليق شبكة/IPC محمي بمهلات (إصلاحات UX حديثة). **ممنوع إعادة تصميم هذه السلسلة**؛ يُسمح فقط بإضافات اختيارية غير حاجبة.

### 2.4 الترخيص والتفعيل

- إصدار: Engine V2 + V5 keys + V6 verify  
- Consume لمرة واحدة: `LicenseActivationGate` + Drive `activation.consumed` (+ Vault اختياري)  
- أجهزة لاحقة: Google → سحب `license.json` → قفل فرع → hydrate  
- حدود الفروع: صارمة عبر `LicenseLimits`  
- حدود الأجهزة: الحقل موجود في الباقة/`limits.maxDevices` لكن `canRegisterDevice` يعيد حالياً `unlimited: true` (تشخيص فقط)

### 2.5 الفروع والأجهزة

- فرع الجهاز: `DeviceConfig.lockedBranchId`  
- نطاق المستخدم: `user.branchScope` + `BranchScope`  
- السجل: `license.json.devices.registered`  
- التبديل: `BranchSwitcher` للمديرين/نطاق `*`

### 2.6 Owner Hub الحالي (`cloud/owner-hub.js`)

**يملك اليوم:** حالة الترخيص، Center ID، الأجهزة، صحة المزامنة، تعارضات، تدقيق حديث، لقطات تشخيص، روابط لإعداد المركز.

**لا يملك اليوم (مؤجّل سياساتياً):** إيرادات عبر الفروع، KPI مالية، تجميع سحابي عند الطلب، إدارة Owner-only للمستخدم المؤسسي، تعطيل جهاز كسياسة باقة صارمة.

### 2.7 RBAC

- أدوار الواجهة: admin / reception / accountant / custom / employee  
- Cloud: `owner`, `hq_admin`, `branch_manager`, `doctor` في سياسات النطاق  
- `RolePolicy.MANAGER_ROLES = admin|owner|hq_admin` — Owner اليوم ≈ مدير  
- الصلاحيات الدقيقة: `cupping-ext-modules.js` (allowlist بعد Phase 6)

### 2.8 Cloud / Backup

- Local = Source of Truth؛ Drive = وسيط  
- Push + Poll؛ Merge/Conflict لـ cases/expenses صارم  
- Backup: JSON + Clinic DB مشفّر + `BackupLayer` اليومي على Drive  
- الاستعادة: `SyncedWrite.restoreFromBackup` + Staging (مدير)

---

## 3. المعمارية الحالية (رسم)

```text
                    ┌──────────────────────────┐
                    │   Staff Login (User/Pass) │
                    │   RBAC + BranchScope      │
                    └────────────┬─────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
   Daily Ops UI            Owner Hub (ops)          License Screen
   (cases/bookings/…)      diagnostics              (dev/activation)
         │                       │                       │
         └───────────┬───────────┴───────────┬───────────┘
                     ▼                       ▼
              Repository/SyncedWrite    LicenseCloud + Limits
                     │                       │
              SyncEngine Push/Poll     activation + devices[]
                     │                       │
                     └───────────┬───────────┘
                                 ▼
                    Google Drive (per Center ID)
           License | Center | Branches/{id}/Config|Ops|Backup
```

**Boot (قبل الدخول):**

```text
[NEW] Key → Consume → Google bind → Center → Branch+Device → Manager → Login
[EXISTING] Google → Pull license → Choose branch+device name → Login
```

---

## 4. ما يمكن إعادة استخدامه (Reuse ≥ الأقصى)

| النظام الحالي | إعادة الاستخدام |
|---------------|-----------------|
| `CenterId` / `__tdw_meta__` | هوية المؤسسة (Organization ≡ Center) |
| `LicenseCloud` + Activation Gate + Vault | طبقة License |
| `DeviceConfig` + `DeviceRegistry` | طبقة Device |
| `BranchScope` + Enrollment + Switcher + Phase 18 guards | طبقة Branch |
| `RolePolicy` + Permissions allowlist | أساس RBAC + إضافة تمييز Owner |
| `BootFlow` مسارات NEW/EXISTING | توسيع خطوات فقط (لا استبدال) |
| `doLogin` / بوابات الترخيص | تبقى؛ إضافات اختيارية بعد الدخول |
| `CloudBootstrap` / SyncEngine / Repository | المزامنة كما هي |
| `BackupBridge` / BackupLayer / RestoreStaging | Backup/Restore مع توسيع نطاق لاحقاً |
| `OwnerHub` + Phase 19 APIs | نواة لوحة التحكم |
| `AuditLogger` | توسيع أحداث الفروع/الأجهزة/الاشتراك |
| `SettingsGuard` | حماية بيانات المركز/الترخيص |
| بوابات الاختبار 1–20 | نموذج اختبار لكل مرحلة جديدة |

**نسبة إعادة الاستخدام المتوقعة للمرحلة الأولى من التنفيذ:** عالية جداً على الطبقات التحتية؛ الإضافات تكون وحدات/بوابات/حقول — لا Modules جديدة بديلة.

---

## 5. ما يحتاج إضافة فقط (Additive Layers)

> مبدأ: **ملف جديد أو دالة جديدة أو بوابة شرط** — دون حذف مسار يعمل.

1. **Owner Profile Layer**  
   - حساب Owner يُنشأ مرة عند أول تفعيل ناجح  
   - حقول: username, password hash/salt, recovery PIN/code, cloud identity link  
   - تمييز صريح: Owner ≠ Admin الفرع (Admin يبقى لتشغيل الفرع)

2. **Organization Facade**  
   - واجهة مفاهيمية فوق Center ID (`Organization.getId()` → centerId)  
   - بدون جدول Org موازٍ في المراحل 1–8 من الخطة

3. **Owner Hub Control Surfaces**  
   - Branches CRUD (إضافة/إعادة تسمية/تعطيل/حذف) مع فحص الباقة  
   - Devices (rename/disable/delete) + احترام `maxDevices`  
   - Licensing panel (عرض/تجديد حالة — ليس محرك إصدار جديد)  
   - Owner account self-management فقط

4. **Device Limit Enforcement**  
   - تفعيل المنطق الموجود جزئياً داخل `LicenseLimits.canRegisterDevice`

5. **Branch Creation Gate**  
   - منع إنشاء فرع من Boot/Login/Setup بعد أول فرع؛ الإضافة من Owner Hub فقط  
   - الفرع الأول يبقى ضمن مسار الإعداد الحالي (توافق رجعي)

6. **Branch Mode للـ Owner**  
   - جلسة مؤقتة `OwnerSession.mode = owner|branch` + مؤشر UI لاسم الفرع  
   - بدون تغيير Navigation الجذري

7. **Cloud Summary Layer (لاحقاً)**  
   - ملفات ملخصات خفيفة على Drive لكل فرع (`summaries/*.json`)  
   - Owner Hub يحمّل الملخصات عند الطلب — لا تنزيل كل قواعد البيانات

8. **Audit events موسّعة**  
   - add/disable branch/device، دخول Owner Hub، تجديد اشتراك، restore

9. **تقارير Owner Hub**  
   - على دفعات: تشغيلية أولاً، ثم مالية عند الطلب عبر الملخصات

---

## 6. ما يُمنع تغييره (Frozen Surfaces)

### 6.1 بقرارك الصريح في هذه المهمة

- ممنوع Refactor / إعادة كتابة Modules / إعادة تصميم المشروع  
- ممنوع تغيير **Startup** / **Login Flow** / **Boot Flow** / **Navigation** كهيكل  
- ممنوع تغيير **RBAC الحالي** كمحرك (يُسمح بإضافة دور/بوابة)  
- ممنوع تغيير **Database Structure** / **Cloud Architecture** / **License Architecture بالكامل**  
- ممنوع حذف كود يعمل أو كسر شاشات تعمل  
- ممنوع بناء نظام بديل إن أمكنت الإضافة

### 6.2 بقرار Cloud V2 المعتمد (P1–P10)

- Local = SoT · Drive = Mediator · Offline-first  
- Center ID ثابت مدى الحياة  
- لا Primary/Secondary devices  
- **Google ≠ Staff Login**  
- Branch isolation · Repository abstraction · Push+Poll · schemaVersion

### 6.3 بقرار الجودة/المالية

- معادلات المالية والـ golden baselines  
- اسم `userData`: `Cupping Center`  
- أمن Electron / IPC allowlist  
- SQLite بدون مسح مرآة localStorage  
- Owner Hub: لا KPI مالي عبر الفروع **قبل** مرحلة ملخصات معتمدة

### 6.4 تعارض يجب حسمه في الموافقة

رؤيتك تصف Login Flow يبدأ بـ «Google Login».  
المعمارية المعتمدة تقول: Google للسحابة فقط، والدخول الداخلي User/Pass.

**اقتراح التوفيق (يلزم اعتمادك):**

```text
Google Connect (اكتشاف المؤسسة/الترخيص)  ← ليس صلاحيات
        ↓
License Verification
        ↓
Branch Selection (إن لزم)
        ↓
Internal Login (User/Pass)              ← الصلاحيات هنا
        ↓
Role Detection → UI (Owner Hub أو فرع)
```

هذا يحافظ على P6 وعلى منع تغيير Login Flow، مع تحقيق هدف «اكتشاف المؤسسة عبر Google».

---

## 7. مخاطر التنفيذ

| # | المخاطرة | الأثر | التخفيف |
|---|----------|-------|---------|
| R1 | خلط Owner مع Admin الحالي | كسر صلاحيات الفروع أو فتح Owner Hub لغير المخوّل | Owner كعلم/دور إضافي؛ Admin الفرع كما هو؛ اختبارات Phase 6+ |
| R2 | تغيير BootFlow بدلاً من توسيعه | كسر أول تشغيل للعملاء الحاليين | خطوات اختيارية داخل المسارات الحالية فقط |
| R3 | فرض حد الأجهزة فجأة | أجهزة مسجّلة تتجاوز الباقة تُرفض | سياسة جدّ: grandfather الموجود + منع جديد فقط |
| R4 | منع إنشاء الفرع من Setup مبكراً | تعطل مسار NEW | السماح بالفرع الأول من Boot؛ الباقي Owner Hub |
| R5 | تقارير تجميعية تسحب كل البيانات | بطء + تعارض Offline-first | ملخصات خفيفة عند الطلب فقط |
| R6 | Organization ID جديد بجانب Center ID | ازدواج هوية + هجرة Drive | مركز = مؤسسة حتى مرحلة متأخرة اختيارية |
| R7 | المساس بالمالية/الضرائب عبر تقارير Owner | كسر golden tests | تقارير مالية لاحقة + مقارنة baselines |
| R8 | توسيع Audit/Settings يكتب قبل Login | رجوع مشاكل UX (توست/شاشة فارغة) | الالتزام بـ pre-auth allowlist الحالي |
| R9 | تعطيل جهاز يقطع المزامنة بقسوة | فقدان عمل Offline | disable = منع تسجيل/مزامنة جديدة مع الإبقاء المحلي |
| R10 | تنفيذ كبير دفعة واحدة | كسر RC3 | 18 مرحلة مستقلة + اختبار لكل مرحلة + عدم الدمج دون PASS |

---

## 8. تأثير التنفيذ على الأسطح الحرجة

| السطح | التأثير المسموح | التأثير الممنوع |
|-------|------------------|-----------------|
| **Startup** | استدعاء اختياري غير حاجب بعد `licCheck` | إعادة ترتيب/حذف خطوات؛ إطالة بدون مهلة |
| **Login** | بعد الدخول: توجيه Owner إلى Hub؛ Branch Mode | جعل Google هو دخول الموظفين؛ تغيير `doLogin` جوهرياً |
| **BootFlow** | إضافة/تشديد خطوة Owner ضمن NEW؛ بوابة فرع أول | استبدال المسارات؛ إجبار Wizard جديد كامل |
| **Cloud** | حقول ملخصات + أحداث أجهزة/فروع | تغيير SoT؛ تغيير هيكل Drive الجذري مبكراً |
| **Backup** | وسوم مؤسسة/فرع في الميتا؛ استعادة بجهاز جديد كما هو | إعادة كتابة مسار التشفير CDBK |
| **License** | تفعيل حد الأجهزة؛ حقول Owner profile في السحابة | استبدال V5/V6؛ حذف Activation Gate |

---

## 9. خطة تنفيذ تدريجية — 18 مرحلة (Surgical)

> كل مرحلة: فرع مستقل `cursor/ng-XX-…-c2ea` + اختبارات + `docs/NG-XX-RESULTS.md` + بدون كسر `npm test`.  
> **لا تبدأ المرحلة N+1 قبل PASS لـ N وموافقة صريحة عند البوابات عالية المخاطر.**

### المرحلة 0 — هذا التقرير (الحالية)
- تسليم وثيقة التصميم + مصفوفة الموافقة  
- **لا كود**

### المرحلة 1 — Organization Facade (قراءة فقط)
- `Organization` كواجهة فوق `CenterId` + اسم العرض  
- بدون تغيير تخزين  
- اختبار: الهوية تساوي centerId

### المرحلة 2 — Owner Role Semantics (سياسة فقط)
- تمييز Owner عن Admin في `RolePolicy` (صلاحيات Hub vs تشغيل يومي)  
- بدون إجبار هجرة المستخدمين الحاليين  
- اختبار: Admin لا يرى سطح Owner-only؛ Owner يراه

### المرحلة 3 — Owner Profile Store (تخزين إضافي)
- مفتاح إضافي لحساب Owner (hash/salt/recovery) مربوط بالترخيص/المركز  
- لا حذف `users` الحالي  
- اختبار: إنشاء/تحقق/recovery بدون كسر login الحالي

### المرحلة 4 — ربط Owner بأول تفعيل (امتداد بوابة)
- بعد `commitActivation` الناجح: إن لم يوجد Owner → علامة `ownerSetupRequired`  
- **بدون** تغيير ترتيب Startup  
- اختبار: تفعيل جديد يطلب Owner؛ التفعيل المستهلك لا يعيد الطلب عشوائياً

### المرحلة 5 — شاشة إنشاء Owner (UI مضاف)
- شاشة/خطوة إضافية تُفتح عند العلامة فقط (من Boot خطوة manager أو بوابة خفيفة)  
- لا استبدال BootFlow  
- اختبار: إنشاء Owner يغلق العلامة ويمرّر syscheck

### المرحلة 6 — Device Limit Enforcement
- تفعيل `maxDevices` في `canRegisterDevice` مع جدّ الأجهزة الحالية  
- اختبار: الرفض عند الامتلاء؛ السماح ضمن الحد؛ grandfather

### المرحلة 7 — Devices Control في Owner Hub
- Rename / Disable / Delete عبر Hub + مزامنة `license.json`  
- اختبار: العمليات تظهر في السجل وتُحترم عند التسجيل

### المرحلة 8 — Branch Creation Gate
- بعد وجود ≥1 فرع: الإنشاء فقط من Owner Hub  
- Boot NEW ينشئ الفرع الأول فقط كما اليوم  
- اختبار: Setup لا يضيف فرعاً ثانياً؛ Hub يضيف ضمن `maxBranches`

### المرحلة 9 — Branches Control في Owner Hub
- Add / Rename / Disable / Delete + رفع Drive  
- اختبار: الجهاز الجديد يرى الفروع المحدّثة بعد السحب

### المرحلة 10 — Branch Mode للـ Owner
- مؤشر وضع Owner/Branch + التبديل المؤقت لنطاق فرع  
- بدون إعادة تصميم Navigation  
- اختبار: البيانات المعروضة تُفلتر حسب الوضع؛ العودة لـ Owner Mode

### المرحلة 11 — توسيع Audit
- أحداث: branch/device/owner-hub/license/subscription/restore  
- اختبار: الكتابة والقراءة في Hub diagnostics

### المرحلة 12 — Licensing Panel في Owner Hub
- عرض الباقة/الانتهاء/التجديد/الحالة (قراءة + روابط التجديد الحالية)  
- لا محرك إصدار جديد  
- اختبار: تطابق البيانات مع `LicenseCloud`

### المرحلة 13 — Cloud Summary Contract
- تعريف ملف ملخص فرع (عملاء/زيارات/إيراد ملخص…) يُنتَج محلياً ويُرفع  
- لا قراءة تقارير بعد  
- اختبار: توليد الملخص لا يكسر SyncGuard/المالية

### المرحلة 14 — Owner Hub Operational Reports
- لوحة: فروع/أجهزة/مستخدمون/آخر مزامنة/تنبيهات من الملخصات + الحالة الحية  
- **بدون** KPI مالي ثقيل إن لم تُعتمد بعد  
- اختبار: التحميل عند الطلب؛ العمل offline بالملخص المحلي

### المرحلة 15 — Owner Hub Financial Summaries (بوابة موافقة)
- تقارير مالية من الملخصات فقط  
- مقارنة مع golden/verify:sensitive  
- **توقف إلزامي لموافقتك قبل الدمج**

### المرحلة 16 — Backup/Restore وسم المؤسسة/الفرع
- ميتا إضافية؛ مسارات استعادة جهاز جديد/فرع كما العقود الحالية  
- اختبار: verify:backup + استعادة لا تكسر Staging

### المرحلة 17 — Hardening + Compatibility
- عملاء قدامى بدون Owner Profile → مسار ترقية اختياري (أول مدير يصبح Owner بموافقة)  
- اختبارات رجعية Boot NEW/EXISTING + Login + Cloud

### المرحلة 18 — Freeze Gate لمسار Next-Gen
- بوابة `ng-release-gate` + دليل قبول + عدم كسر بوابات 14–20  
- قرار Go/No-Go

---

## 10. اختبارات مستقلة لكل مرحلة

| مرحلة | حزمة اختبار مقترحة | ما تغطيه |
|-------|---------------------|----------|
| 1 | `ng:org-facade` | centerId ≡ orgId المفاهيمي |
| 2 | `ng:owner-policy` | فصل Owner/Admin في الوصول للـ Hub |
| 3 | `ng:owner-profile` | تخزين hash/recovery |
| 4 | `ng:owner-activation-flag` | علامة بعد التفعيل |
| 5 | `ng:owner-setup-ui` | إنشاء Owner يغلق البوابة |
| 6 | `ng:device-limits` | maxDevices + grandfather |
| 7 | `ng:hub-devices` | disable/delete/rename |
| 8 | `ng:branch-gate` | منع فرع ثانٍ خارج Hub |
| 9 | `ng:hub-branches` | CRUD فروع + Drive |
| 10 | `ng:branch-mode` | تبديل وضع Owner |
| 11 | `ng:audit-events` | الأحداث الجديدة |
| 12 | `ng:hub-licensing` | تطابق حالة الترخيص |
| 13 | `ng:summary-contract` | شكل الملخص + الرفع |
| 14 | `ng:hub-ops-reports` | تحميل عند الطلب |
| 15 | `ng:hub-finance` + `verify:sensitive` | عدم كسر المالية |
| 16 | `ng:backup-tags` + `verify:backup` | الاستعادة |
| 17 | `ng:compat-matrix` | مسارات قديمة |
| 18 | `ng:release-gate` + `npm test` | تجميد |

**قاعدة:** كل مرحلة يجب أن تبقي `npm test` = PASS على قاعدة RC3.

---

## 11. تأكيد الالتزام بالتعديلات الجراحية (Surgical)

يُعتمد التعريف التالي لأي تنفيذ لاحق:

1. **إضافة** ملفات/دوال/شروط — لا استبدال وحدات كاملة.  
2. **عدم** حذف مسارات Boot/Login/Startup/Navigation العاملة.  
3. **عدم** تغيير مخطط SQLite العام أو هجرات كاسرة دون مرحلة مستقلة وموافقة.  
4. **عدم** إعادة كتابة License Engine أو SyncEngine.  
5. كل PR مرحلة واحدة؛ حجم صغير؛ اختبارات المرحلة + الانحدار الكامل.  
6. أي انحراف عن «إضافة فقط» يُعدّ خارج النطاق ويحتاج موافقة مكتوبة جديدة.

---

## 12. ما لن يُنفَّذ الآن

- لا كتابة كود تطبيقي لهذه الرؤية في هذا الفرع.  
- لا تغيير Startup/Login/Boot/RBAC/Cloud/License.  
- لا دمج مراحل Next-Gen قبل موافقتك على:
  1. هذا التقرير  
  2. خطة الـ 18 مرحلة  
  3. قرار التوفيق: **Google Connect ≠ Staff Login**  
  4. قرار الهوية: **Organization ≡ Center ID** في المراحل الأولى  
  5. قرار الفرع الأول: يبقى من Boot؛ الفروع التالية من Owner Hub فقط  

---

## 13. مصفوفة الموافقة (يلزم ردك)

يرجى اعتماد كل بند بـ **موافق / تعديل / مرفوض**:

| # | البند | اقتراح Phase Zero |
|---|--------|-------------------|
| A | Organization ≡ Center ID أولاً | موافق؟ |
| B | Google للربط والاكتشاف فقط؛ الدخول User/Pass | موافق؟ |
| C | عدم تغيير هيكل Boot/Login/Startup — توسيع فقط | موافق؟ |
| D | Owner ≠ Admin تشغيلياً عبر طبقة مضافة | موافق؟ |
| E | الفرع الأول من Boot؛ الباقي Owner Hub | موافق؟ |
| F | تفعيل حد الأجهزة مع حماية الأجهزة الحالية | موافق؟ |
| G | التقارير المالية عبر الملخصات فقط وفي مرحلة متأخرة بموافقة منفصلة | موافق؟ |
| H | البدء بالمرحلة 1 بعد اعتماد هذه الوثيقة | موافق؟ |
| I | أي تعديل على بنود «ممنوع» يحتاج وثيقة تعديل نطاق | موافق؟ |

---

## 14. الهدف النهائي بعد اكتمال المراحل (بدون كسر RC3)

- **Owner** يدير المؤسسة من Owner Hub (ترخيص، فروع، أجهزة، تقارير عند الطلب).  
- **Admin** يدير فرعه فقط ولا يرى إدارة المؤسسة.  
- **Employees** ضمن الصلاحيات الحالية.  
- **Google** للهوية السحابية والمزامنة والنسخ فقط.  
- **الصلاحيات** داخل نظام المستخدمين.  
- **الفروع/الأجهزة** مركزياً من Owner Hub.  
- التشغيل اليومي (استقبال، زيارات، فواتير، رواتب…) يبقى على نفس الأساسات الحالية.

---

**نهاية وثيقة Phase Zero — بانتظار موافقتك قبل أي كود.**
