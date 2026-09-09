# Cloud V2 — المعمارية المعتمدة (Baseline)

**الإصدار:** 1.0.0  
**التاريخ:** 15 يوليو 2026  
**الحالة:** ✅ معتمد — Baseline قبل Sprint 1  
**النطاق:** إصدار تجاري متعدد الأجهزة والفروع (بدون SQLite في v1، بدون Delta Engine في v1)

---

## جدول المحتويات

1. [الملخص التنفيذي](#1-الملخص-التنفيذي)
2. [المبادئ غير القابلة للتفاوض](#2-المبادئ-غير-القابلة-للتفاوض)
3. [طبقات النظام](#3-طبقات-النظام)
4. [Local-First — Google Drive وسيط فقط](#4-local-first--google-drive-وسيط-فقط)
5. [Center ID](#5-center-id)
6. [هيكل Google Drive (4 طبقات)](#6-هيكل-google-drive-4-طبقات)
7. [الترخيص (License Layer)](#7-الترخيص-license-layer)
8. [سجل الأجهزة (Device Registry)](#8-سجل-الأجهزة-device-registry)
9. [الفروع — Branch Lock و Branch Scope](#9-الفروع--branch-lock-و-branch-scope)
10. [Configuration Layer — إعدادات لكل فرع](#10-configuration-layer--إعدادات-لكل-فرع)
11. [Operational Layer — البيانات التشغيلية](#11-operational-layer--البيانات-التشغيلية)
12. [Backups Layer](#12-backups-layer)
13. [Repository Layer](#13-repository-layer)
14. [Device Cache](#14-device-cache)
15. [versions.json — إصدارات متعددة](#15-versionsjson--إصدارات-متعددة)
16. [schemaVersion — ترقية البرنامج](#16-schemaversion--ترقية-البرنامج)
17. [المزامنة — Push + Poll](#17-المزامنة--push--poll)
18. [Record Locks](#18-record-locks)
19. [Audit Log](#19-audit-log)
20. [Owner Hub (نسخة minimal)](#20-owner-hub-نسخة-minimal)
21. [ما لا يُزامَن](#21-ما-لا-يُزامَن)
22. [Bootstrap — جهاز جديد](#22-bootstrap--جهاز-جديد)
23. [Interfaces (Contracts)](#23-interfaces-contracts)
24. [خطة Sprint](#24-خطة-sprint)
25. [ما يُؤجَّل إلى v2](#25-ما-يُؤجَّل-إلى-v2)
26. [معايير القبول — MVP تجاري](#26-معايير-القبول--mvp-تجاري)
27. [ربط بالكود الحالي](#27-ربط-بالكود-الحالي)

---

## 1. الملخص التنفيذي

### الهدف

بناء **منصة تجارية** تدعم:

- مراكز متعددة الفروع
- أجهزة متعددة **بدون جهاز رئيسي**
- عمل **offline كامل** (أسبوع أو أكثر)
- مزامنة **خفيفة** عبر Google Drive (وسيط — ليس قاعدة بيانات)
- إمكانية **الانتقال لاحقاً** إلى SQLite أو مزود سحابي آخر دون إعادة كتابة المنطق

### القرار المعماري المركزي

```
Application
    ↓
Repository Layer (interface)
    ↓
Local Database = Source of Truth
    ↓
Device Cache (فتح فوري)
    ↓
Sync Engine (Push + Poll)
    ↓
Google Drive = Sync Mediator فقط
```

### ما يُنفَّذ في v1

| ✅ نعم | ⚠️ مؤجل |
|--------|---------|
| Center ID | Delta Engine |
| license.json على Drive | SQLite |
| Device Registry | Owner Hub كامل (رسوم) |
| Branch Lock + Branch Scope | Conflict Resolver معقد |
| Config per branch | OneDrive / Dropbox |
| Repository Layer | |
| versions.json متعدد | |
| Device Cache | |
| schemaVersion + Migrations | |
| Push + Poll | |
| Record Locks | |
| Audit Log | |
| Backups Layer | |

---

## 2. المبادئ غير القابلة للتفاوض

| # | المبدأ | التفسير |
|---|--------|---------|
| P1 | **Local = Source of Truth** | كل قراءة/كتابة تمر عبر Local أولاً |
| P2 | **Drive = Sync Mediator** | Google للنقل والمزامنة — ليس قاعدة البيانات |
| P3 | **Offline-First** | البرنامج يعمل 100% بدون إنترنت |
| P4 | **Center ID ثابت** | لا يتغير مدى الحياة — لا يعتمد على اسم المركز |
| P5 | **لا Primary/Secondary** | كل الأجهزة peers |
| P6 | **Google ≠ Login** | Google لربط السحابة؛ Staff يدخل User/Pass |
| P7 | **Branch Isolation** | 3 طبقات: جهاز + مستخدم + بيانات |
| P8 | **Repository Abstraction** | localStorage v1 → SQLite v2 بدون تغيير UI |
| P9 | **Push + Poll** | Push فوري عند التعديل؛ Poll كل ~60 ثانية |
| P10 | **schemaVersion** | كل تحديث برنامج = migrations تلقائية |

---

## 3. طبقات النظام

```
┌─────────────────────────────────────────────────────────┐
│  Presentation — UI, Reports, Modals                     │
├─────────────────────────────────────────────────────────┤
│  Application — Business Logic (cases, bookings, payroll)│
├─────────────────────────────────────────────────────────┤
│  Repository Layer — get/set/query/revision              │
├─────────────────────────────────────────────────────────┤
│  Local Database — Source of Truth                       │
│  (LocalStorageAdapter v1 → SqliteAdapter v2)            │
├─────────────────────────────────────────────────────────┤
│  Device Cache — last known good snapshot                │
├─────────────────────────────────────────────────────────┤
│  Sync Engine — Push (on write) + Poll (periodic)        │
├─────────────────────────────────────────────────────────┤
│  Cloud Adapter — Google Drive (v1)                      │
│  (OneDrive/Dropbox/S3 — v2+)                            │
└─────────────────────────────────────────────────────────┘
```

### فصل المسؤوليات الأربع على Drive

| الطبقة | المحتوى | تكرار التغيير |
|--------|---------|---------------|
| **License** | ترخيص، أجهزة، فروع، ميزات | نادر (تجديد/ترقية) |
| **Configuration** | إعدادات، أسعار، خدمات، مستخدمون | متوسط |
| **Operational** | عملاء، حجوزات، فواتير، مخزون | يومي/كثيف |
| **Backups** | snapshots كاملة | يومي/يدوي |

---

## 4. Local-First — Google Drive وسيط فقط

### ❌ خطأ شائع

```
Google Drive = Source of Truth
→ UI ينتظر Drive عند كل تشغيل
→ انقطاع Net = توقف العمل
```

### ✅ النموذج المعتمد

```
Local Database = Source of Truth
→ UI يفتح فوراً من Cache
→ Sync Engine في الخلفية
→ Drive ينقل الفروق فقط
```

### قواعد الكتابة والقراءة

| العملية | المسار |
|---------|--------|
| **Read** | Local → (optional) refresh from Cache |
| **Write** | Local → revision++ → Audit → Push (async) |
| **Startup** | Load Local → UI open → background Poll |
| **Offline** | Local only → queue pending pushes |
| **Online restored** | Flush pending → Poll |

### sync-state.json (محلي)

```json
{
  "lastPollAt": "2026-07-15T08:30:00Z",
  "lastPushAt": "2026-07-15T08:29:55Z",
  "pendingPushes": [
    { "layer": "operational", "table": "cases", "branchId": "BR-RYD", "revision": 451 }
  ],
  "online": true
}
```

---

## 5. Center ID

### التنسيق

```
NJR-CLINIC-8F42A91C
```

- **Prefix:** `NJR-CLINIC-`
- **Suffix:** 8 hex chars (UUID-derived)
- **يُنشأ:** مرة واحدة عند إصدار أول ترخيص (المطوّر)
- **لا يتغير:** تجديد، ترقية، تغيير اسم المركز، تغيير Google account

### الاستخدام

- جذر كل مسارات Drive: `NajjarTech/{centerId}/`
- مرجع في license.json، versions.json، Audit Log
- مستقبل: OneDrive/Dropbox بنفس centerId

### vs centerName

| centerName | centerId |
|------------|----------|
| قابل للتغيير | ثابت |
| للعرض فقط | للمسارات والمزامنة |
| "مركز نجار الرياض" | `NJR-CLINIC-8F42A91C` |

---

## 6. هيكل Google Drive (4 طبقات)

```
NajjarTech/
└── {centerId}/
    ├── License/
    │   ├── license.json
    │   └── license.sig
    │
    ├── Configuration/
    │   ├── center.json
    │   └── branches/
    │       └── {branchId}/
    │           ├── settings.json
    │           ├── prices.json
    │           ├── services.json
    │           ├── packages.json
    │           └── users.json
    │
    ├── Operational/
    │   └── branches/
    │       └── {branchId}/
    │           ├── cases.json
    │           ├── clients.json
    │           ├── bookings.json
    │           ├── expenses.json
    │           ├── attendance.json
    │           └── inventory.json
    │
    ├── Sync/
    │   ├── versions.json          ← master index (Poll target)
    │   └── locks/
    │       └── {branchId}.json
    │
    ├── Backups/
    │   ├── Auto/
    │   │   └── {date}.tdw
    │   └── Manual/
    │       └── {timestamp}.tdw
    │
    └── Logs/
        └── audit-{YYYY-MM}.json
```

### ملاحظات

- **Sync/versions.json** = ملف Poll الوحيد (~1KB) — يجمع كل revision numbers
- **Operational** منفصل عن **Configuration** — تغيير سعر لا يلمس cases
- **Backups** = safety net — ليس آلية المزامنة اليومية

---

## 7. الترخيص (License Layer)

### من المسؤول؟

| الدور | المسؤولية |
|-------|-----------|
| **المطوّر (NajjarTech)** | إنشاء Center ID، license، مفتاح تفعيل، تجديد، ترقية |
| **Owner** | Google Login، إدخال مفتاح، Bootstrap أول جهاز |
| **الموظف** | لا يلمس الترخيص |

### license.json (schema)

```json
{
  "schemaVersion": 1,
  "centerId": "NJR-CLINIC-8F42A91C",
  "centerName": "مجموعة نجار للحجامة",
  "licenseId": "L000042",
  "licenseUuid": "550e8400-e29b-41d4-a716-446655440000",
  "packageId": "03",
  "subscriptionId": "05",
  "expiresAt": "2027-06-30",
  "features": ["core_dashboard", "bk_drive", "book_schedule"],
  "limits": {
    "maxDevices": 5,
    "maxBranches": 3,
    "maxUsers": 20
  },
  "branches": [
    { "id": "BR-RYD", "name": "فرع الرياض", "code": "RYD", "active": true },
    { "id": "BR-JED", "name": "فرع جدة", "code": "JED", "active": true }
  ],
  "devices": {
    "registered": []
  },
  "licenseVersion": 5,
  "issuedAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-07-15T08:00:00Z",
  "signature": "BASE64_HMAC_OR_RSA..."
}
```

### التحقق

1. **Local copy** signed — يعمل offline (grace 7 أيام)
2. **Drive copy** — للمزامنة بين الأجهزة وتسجيل أجهزة جديدة
3. **تعديل يدوي** → يرفض (signature invalid)

### Bootstrap

```
Google Login → مفتاح تفعيل → build/read license.json → save Local → upload Drive
```

---

## 8. سجل الأجهزة (Device Registry)

### ❌ مُلغى نهائياً

- `deviceRole: primary`
- `deviceRole: secondary`
- «الجهاز الرئيسي»

### ✅ كل جهاز

```json
{
  "deviceUuid": "550e8400-e29b-41d4-a716-446655440001",
  "deviceName": "Reception-PC",
  "branchId": "BR-RYD",
  "registeredAt": "2026-07-15T07:00:00Z",
  "lastSeenAt": "2026-07-15T08:30:00Z",
  "appVersion": "2.0.0",
  "active": true
}
```

### تسجيل جهاز جديد

```
1. قراءة license.json (Local أو Drive)
2. if registered.length >= maxDevices → رفض
3. else → append device → licenseVersion++ → Push
```

### Heartbeat

- كل **5 دقائق** (background): `lastSeenAt` update
- Owner Hub يعرض 🟢/🔴 حسب lastSeen

### device config (محلي — لا يُزامَن)

```json
{
  "deviceUuid": "...",
  "deviceName": "Reception-PC",
  "centerId": "NJR-CLINIC-8F42A91C",
  "lockedBranchId": "BR-RYD",
  "branchLocked": true
}
```

**Storage key:** `__tdw_device_config__`

---

## 9. الفروع — Branch Lock و Branch Scope

### 3 طبقات عزل

```
① Device: lockedBranchId + branchLocked=true
② User:   branchScope[] + canSwitchBranch
③ Data:   branchId + centerId على كل سجل
```

### Branch Lock (الجهاز)

- أول تشغيل: اختيار فرع من license.branches
- `branchLocked: true` — لا تغيير إلا Owner + password + audit
- Reception-PC في الرياض **لا يرى** خيار جدة

### Branch Scope (المستخدم)

| الدور | branchScope | canSwitchBranch |
|-------|-------------|-----------------|
| reception | `["BR-RYD"]` | false |
| doctor | `["BR-RYD"]` | false |
| branch_manager | `["BR-RYD"]` | false |
| accountant_central | `["BR-RYD","BR-JED"]` | true |
| owner | `["*"]` | true |
| hq_admin | `["*"]` | true |

### activeBranchId

- في **session** (sessionStorage)
- Owner/Accountant يبدّلون عبر Branch Switcher
- كل query/report يمر عبر `filterByBranch()`

### Migration مراكز حالية

```json
{ "id": "BR-MAIN", "name": "الفرع الرئيسي", "code": "MAIN", "active": true }
```

كل السجلات القديمة → `branchId: "BR-MAIN"`

---

## 10. Configuration Layer — إعدادات لكل فرع

### center.json (مشترك)

```json
{
  "centerId": "NJR-CLINIC-8F42A91C",
  "centerName": "مجموعة نجار للحجامة",
  "taxNum": "...",
  "crNum": "...",
  "defaultVatRate": 15,
  "branches": ["BR-RYD", "BR-JED"]
}
```

### per branch (`Configuration/branches/{branchId}/`)

| ملف | المحتوى |
|-----|---------|
| settings.json | عنوان، هاتف، ZATCA، طباعة (غير local printer) |
| prices.json | أسعار الكؤوس، الخدمات |
| services.json | قائمة الخدمات |
| packages.json | الباقات |
| users.json | موظفو هذا الفرع + roles |

**رياض ≠ جدة** — أسعار، موظفون، إعدادات مستقلة.

### متى يُرفع؟

```
Save → Local → settingsVersion++ (or pricesVersion++) → Push
```

---

## 11. Operational Layer — البيانات التشغيلية

### per branch (`Operational/branches/{branchId}/`)

| جدول | ملف |
|------|-----|
| cases | cases.json |
| clientsRegistry | clients.json |
| bookings | bookings.json |
| expenses | expenses.json |
| attendance | attendance.json |
| inventoryItems | inventory.json |
| ... | ... |

### كل سجل

```json
{
  "id": "case-123",
  "centerId": "NJR-CLINIC-8F42A91C",
  "branchId": "BR-RYD",
  "...": "..."
}
```

### Revision

- `databaseVersion` global + `branchRevisions.{branchId}` في versions.json
- عند أي write → bump revision → Push table file

### Chunking (v1.5 — عند >5MB)

```
cases-2026-07.json
cases-2026-06.json
```

---

## 12. Backups Layer

### الغرض

- **Safety net** — ليس المزامنة اليومية
- استعادة كاملة عند corruption
- نسخ يدوي قبل import كبير

### الجدول

| النوع | التكرار | المسار |
|-------|---------|--------|
| Auto | يومي (ليلاً) | `Backups/Auto/{date}.tdw` |
| Manual | عند الطلب | `Backups/Manual/{timestamp}.tdw` |
| Pre-import | قبل استيراد | محلي + optional Drive |

### vs Sync

| Sync (Push+Poll) | Backup |
|------------------|--------|
| incremental via revision | full snapshot |
| كل ثوانٍ/دقيقة | يومي/يدوي |
| Operational tables | كل شيء |

---

## 13. Repository Layer

### الهدف

فصل منطق التطبيق عن آلية التخزين — **Sprint 1**.

### Interface

```javascript
/**
 * @typedef {Object} Repository
 */
const Repository = {
  /** @param {string} table @param {string} [id] */
  get(table, id) {},

  /** @param {string} table @param {string} id @param {object} data */
  set(table, id, data) {},

  /** @param {string} table @param {string} id */
  delete(table, id) {},

  /** @param {string} table @param {object} [filter] */
  query(table, filter) {},

  /** @param {string} table — current revision */
  getRevision(table) {},

  /** @param {string} table — increment and return */
  bumpRevision(table) {},

  /** all tables — for sync */
  getAllRevisions() {},
};
```

### Adapters

| Adapter | المرحلة | التخزين |
|---------|---------|---------|
| LocalStorageRepository | v1 (now) | localStorage via existing DB keys |
| SqliteRepository | v2 (later) | Electron better-sqlite3 |

### Migration path

```
index.html DB.get/set  →  Repository.set  →  LocalStorageAdapter
                                              ↓ (swap)
                                         SqliteAdapter
```

**Rule:** لا `localStorage` مباشر خارج Repository.

### حقن branchId تلقائياً

```javascript
Repository.set('cases', id, data) {
  data.branchId = data.branchId || getActiveBranchId();
  data.centerId = data.centerId || getCenterId();
  // ... persist, bumpRevision, trigger Push
}
```

---

## 14. Device Cache

### الهدف

**فتح فوري** — لا انتظار Google.

### الموقع (Electron)

```
{userData}/
├── repository/          ← source of truth
├── cache/
│   ├── versions.json
│   ├── license.json
│   └── branches/
│       └── BR-RYD/
│           ├── settings.json
│           └── ...
└── sync-state.json
```

### Startup sequence

```
1. Load meta.json (schemaVersion) → run migrations if needed
2. Repository.init() from local storage
3. Hydrate from cache/ if faster path
4. UI render — READY
5. background: SyncEngine.poll()
6. background: SyncEngine.flushPending()
```

### Offline أسبوع

- Steps 1–4 تعمل بدون Net
- Step 5–6 تنتظر `online` event
- pendingPushes تتراكم في sync-state.json

---

## 15. versions.json — إصدارات متعددة

### الملف المركزي: `Sync/versions.json`

```json
{
  "centerId": "NJR-CLINIC-8F42A91C",
  "schemaVersion": 3,
  "updatedAt": "2026-07-15T08:30:00Z",
  "updatedBy": {
    "deviceUuid": "abc-123",
    "deviceName": "Reception-PC"
  },

  "licenseVersion": 5,
  "settingsVersion": 54,
  "pricesVersion": 17,
  "servicesVersion": 9,
  "packagesVersion": 12,
  "usersVersion": 23,
  "databaseVersion": 1125,

  "branches": {
    "BR-RYD": {
      "databaseVersion": 451,
      "settingsVersion": 12,
      "pricesVersion": 8,
      "servicesVersion": 3
    },
    "BR-JED": {
      "databaseVersion": 389,
      "pricesVersion": 11
    }
  }
}
```

### Poll logic

```
remote = GET Sync/versions.json
local  = read local versions mirror

for each (table, branch) in remote:
  if remote.revision > local.revision:
    download corresponding file only
    merge into Local
    local.revision = remote.revision

if local.revision > remote.revision (we changed):
  already pushed via Push path
```

### ما يُحمَّل عند تغيير prices فقط

```
✅ Configuration/branches/BR-RYD/prices.json  (~5KB)
❌ Operational/branches/BR-RYD/cases.json     (skip)
❌ Configuration/branches/BR-JED/*            (skip)
```

---

## 16. schemaVersion — ترقية البرنامج

### meta.json (محلي)

```json
{
  "schemaVersion": 3,
  "appVersion": "2.1.0",
  "centerId": "NJR-CLINIC-8F42A91C",
  "migratedAt": "2026-07-15T08:00:00Z"
}
```

**Storage key:** `__tdw_meta__`

### Startup

```javascript
if (meta.schemaVersion < APP_SCHEMA_VERSION) {
  MigrationRunner.run(meta.schemaVersion, APP_SCHEMA_VERSION);
  meta.schemaVersion = APP_SCHEMA_VERSION;
  save(meta);
}
```

### Migrations registry

```javascript
const MIGRATIONS = [
  { from: 1, to: 2, run: migrate_v1_to_v2_addBranchId },
  { from: 2, to: 3, run: migrate_v2_to_v3_splitSettings },
  { from: 3, to: 4, run: migrate_v3_to_v4_repositoryLayer },
];
```

### Rules

- Migrations على **Local فقط**
- قبل Sync
- idempotent where possible
- log to Audit: `SCHEMA_MIGRATED`

---

## 17. المزامنة — Push + Poll

### ❌ مُلغى في v1

- Delta Engine
- Change Log Queue
- LWW Conflict Resolver
- Hash chains
- Sequence numbers
- Poll every 20 seconds fixed

### ✅ النموذج المعتمد

```
WRITE:
  User action
    → Repository.set (Local)
    → bumpRevision
    → AuditLogger.log
    → acquire Lock (if edit existing)
    → SyncEngine.push(table, branchId)   ← فوري (async)
    → release Lock

BACKGROUND:
  every 60 seconds (configurable 30–120):
    SyncEngine.poll()
      → GET versions.json
      → pull changed tables only
```

### Push failure

```
Push fails (offline)
  → append to sync-state.pendingPushes
  → retry on window 'online' event
  → exponential backoff max 5 min
```

### Latency targets

| Event | Target |
|-------|--------|
| حجز جديد → جهاز آخر | 2–5 sec (Push) |
| missed update | ≤ 60 sec (Poll) |
| versions check | ~1KB |

### Debounce

- Burst edits (10 price changes in 5 sec) → debounce Push 2 sec
- single Push with final revision

---

## 18. Record Locks

### الغرض

منع جهازين يعدّلان **نفس السجل** simultaneously.

### Schema: `Sync/locks/{branchId}.json`

```json
{
  "locks": [
    {
      "entity": "client",
      "entityId": "CL-00123",
      "lockedBy": {
        "deviceUuid": "abc-123",
        "deviceName": "Reception-PC",
        "userId": "u-001",
        "userName": "أحمد"
      },
      "acquiredAt": "2026-07-15T14:05:00Z",
      "until": "2026-07-15T14:08:00Z"
    }
  ]
}
```

### Rules

| Rule | Value |
|------|-------|
| TTL | 3 minutes (configurable) |
| Auto-expire | yes — if device disconnects |
| Owner | force-unlock + audit |
| New record | no lock needed |
| Read | no lock |

### UX

```
جهاز B tries edit → "السجل قيد التعديل على Reception-PC — أحمد"
```

### vs Revision

| Locks | Revision |
|-------|----------|
| same record, concurrent edit | different records, sync |
| prevent conflict | detect drift |
| TTL 3 min | permanent until next bump |

---

## 19. Audit Log

### الغرض

تتبع **من غيّر ماذا** — multi-user, multi-device.

### Entry schema

```json
{
  "id": "aud-20260715-001",
  "ts": "2026-07-15T14:05:00Z",
  "centerId": "NJR-CLINIC-8F42A91C",
  "branchId": "BR-RYD",
  "userId": "u-001",
  "userName": "أحمد",
  "deviceUuid": "abc-123",
  "deviceName": "Reception-PC",
  "action": "PRICE_CHANGED",
  "entity": "prices",
  "entityId": "svc-cupping",
  "before": { "price": 17 },
  "after": { "price": 20 },
  "summary": "غيّر السعر 17 → 20"
}
```

### Actions (minimum)

| Action | متى |
|--------|-----|
| PRICE_CHANGED | تغيير سعر |
| SETTINGS_CHANGED | إعدادات فرع |
| USER_ADDED / UPDATED / DELETED | مستخدمين |
| CASE_CREATED / UPDATED / DELETED | حالات |
| PATIENT_DELETED | حذف عميل |
| DEVICE_REGISTERED | جهاز جديد |
| BRANCH_SWITCHED | Owner بدّل فرع |
| SCHEMA_MIGRATED | migration |
| LICENSE_RENEWED | تجديد |

### Storage

| مكان | غرض |
|------|-----|
| Local `auditLog` | UI + offline |
| Drive `Logs/audit-{YYYY-MM}.json` | HQ archive |
| append-only | لا rewrite |

### vs activityLog الحالي

- `activityLog` — UI packages, 200 limit → يبقى
- `AuditLogger` — commercial grade, synced, before/after

---

## 20. Owner Hub (نسخة minimal)

**Sprint 5 — ليس الآن.**

### v1 scope فقط

```
┌─────────────────────────────────────────┐
│  🏢 Owner Hub                           │
├─────────────────────────────────────────┤
│  الترخيص: ✅ نشط — ينتهي 2027-06-30    │
│  الأجهزة: 4/5                           │
│    Reception-PC     🟢 2 min            │
│    Manager-Laptop   🟢 5 min            │
│    MaleRoom         🔴 2 days           │
│  آخر مزامنة: 45 sec ago                 │
│  الفروع: الرياض | جدة | مكة             │
│  مستخدمون نشطون: 3                     │
└─────────────────────────────────────────┘
```

### ❌ v2 (later)

- رسوم بيانية KPI
- إيرادات مجمّعة
- تقارير cross-branch analytics

---

## 21. ما لا يُزامَن

| محلي فقط | السبب |
|----------|-------|
| printer path / name | hardware specific |
| window size / position | UX |
| last open page/tab | UX |
| theme preference (optional local) | personal |
| OAuth refresh token | security — encrypted local |
| deviceUuid / deviceName | device identity |
| lockedBranchId | device binding |
| temp cache | ephemeral |
| local error logs | debug |
| sync-state.json | internal |

---

## 22. Bootstrap — جهاز جديد

```
① Install app
② Google Login (center account)
③ Enter activation key (from vendor)
④ Read/create license.json → Local + Drive
⑤ Register device (if slot available)
⑥ Select branch + name device
⑦ Download Configuration + Operational for branch
⑧ Hydrate Local Repository
⑨ App login (Admin/Reception/...)
⑩ Ready — Push+Poll active
```

**Target time:** < 5 minutes on good connection.

---

## 23. Interfaces (Contracts)

### ملفات مقترحة (Sprint 1)

```
cloud/
├── repository.js           ← Repository interface + LocalStorageAdapter
├── sync-engine.js          ← Push + Poll (Sprint 4)
├── audit-logger.js         ← Audit interface (Sprint 5 impl, Sprint 1 stub)
├── migration-runner.js     ← schemaVersion migrations
├── device-config.js        ← __tdw_device_config__
├── center-id.js            ← centerId helpers
├── drive-layout.js           ← path builders (extends cloud-drive-paths.js)
├── versions.js             ← versions.json read/write/compare
├── lock-manager.js         ← Record Locks (Sprint 4)
└── schemas/
    ├── license.json
    ├── versions.json
    ├── audit-entry.json
    └── device-config.json
```

### SyncEngine interface (Sprint 4)

```javascript
const SyncEngine = {
  push(layer, table, branchId) {},
  poll() {},
  flushPending() {},
  getStatus() { return { lastPoll, lastPush, pending, online }; },
  on(event, handler) {}, // 'online', 'synced', 'conflict'
};
```

### AuditLogger interface

```javascript
const AuditLogger = {
  log({ action, entity, entityId, before, after, summary }) {},
  query(filter) {},
};
```

---

## 24. خطة Sprint

### Sprint 1 — Foundation

| Task | Output |
|------|--------|
| Center ID generation in license | `license-generator-v2.js` |
| Drive layout (4 layers) | `cloud/drive-layout.js`, `electron/cloud-drive-paths.js` |
| license.json build/read/sign | `cloud/license-cloud.js` |
| Repository Layer | `cloud/repository.js` |
| schemaVersion + meta.json | `cloud/migration-runner.js` |
| Feature flag `cloudV2Enabled` | settings |
| verify script | `scripts/verify-cloud-v2.js` |

### Sprint 2 — Devices & Branches

| Task | Output |
|------|--------|
| Device Registry | `cloud/device-registry.js` |
| Remove primary/secondary | drive-sync, cloud-db-backup |
| Branch Lock UI | first-run + settings |
| Branch Scope on users | users schema + guards |
| branchId on records + migration | migration v1→2 |

### Sprint 3 — Config & Cache

| Task | Output |
|------|--------|
| Config per branch on Drive | Configuration layer |
| versions.json | `cloud/versions.js` |
| Device Cache | Electron cache dir |
| Split settings local vs synced | buildFullBackupObject refactor |

### Sprint 4 — Sync

| Task | Output |
|------|--------|
| Revision bump on write | Repository hooks |
| Push on write | `cloud/sync-engine.js` |
| Poll every 60s | background timer |
| Record Locks | `cloud/lock-manager.js` |
| pending push queue | sync-state.json |

### Sprint 5 — Polish

| Task | Output |
|------|--------|
| Owner Hub minimal | UI page |
| Backups Layer daily | Backups/Auto |
| Audit Log full | `cloud/audit-logger.js` + Drive Logs |

---

## 25. ما يُؤجَّل إلى v2

| Feature | Trigger to implement |
|---------|---------------------|
| Delta Engine | >20 devices or >100k records/day |
| SQLite adapter | localStorage >80% capacity or perf issues |
| OneDrive/Dropbox | customer demand |
| Owner Hub analytics | after v1 stable |
| cases.json chunking | file >5MB |
| Real-time WebSocket push | if Poll latency insufficient |

---

## 26. معايير القبول — MVP تجاري

- [ ] Center ID ثابت + Drive 4 layers
- [ ] Local = truth — works offline 7+ days
- [ ] license.json + 5 devices registered — no primary
- [ ] Branch Lock — Reception cannot switch branch
- [ ] Branch Scope — owner sees all, reception one branch
- [ ] Config per branch — different prices Riyadh vs Jeddah
- [ ] Repository — no direct localStorage in app code
- [ ] schemaVersion — migration 1→2 runs on upgrade
- [ ] versions.json — poll downloads only changed table
- [ ] Push — booking appears on other device in <5 sec
- [ ] Poll — catch missed updates within 60 sec
- [ ] Record Lock — second device blocked on same client edit
- [ ] Audit — price change logged with before/after/user/device
- [ ] Backup — daily Auto snapshot on Drive
- [ ] Owner Hub — devices, license, last sync visible

---

## 27. ربط بالكود الحالي

| موجود | التغيير |
|---------|---------|
| `index.html` → `DB.get/set` | wrap with Repository |
| `cupping-drive-sync.js` | deprecate → SyncEngine |
| `electron/cloud-drive-paths.js` | extend for centerId + 4 layers |
| `electron/cloud-db-backup.js` | Backups Layer only — remove primary role |
| `license/engine/*` | emit license.json + centerId |
| `logAudit()` | extend → AuditLogger |
| `activityLog` | keep for UI — separate from Audit |
| `buildFullBackupObject()` | exclude license, device-local; Backups use |
| `settings.branchName` | → branch entity in license + per-branch config |
| `cupping-first-run.js` | add branch select + device name steps |

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-07-15 | Initial approved baseline |

---

**Document owner:** Architecture Team  
**Next step:** Cloud V2 MVP (Sprints 1–5) مكتمل — Sprint 6: Bootstrap + تفعيل Cloud V2 من الإعدادات
