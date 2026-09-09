# دليل عمليات المزامنة والفروع والنسخ (V2-5.9) — محدّث بعد مراجعة المخاطر

> **Near-real-time polling sync** — ليس Real-time.  
> Ready for release / main: **NO** حتى إثبات Windows Setup EXE.

---

## 1) مصدر الحقيقة

```text
الكتابة التشغيلية → SQLite transaction
→ business record + outbox event (نفس المعاملة عند enqueueAtomicPersistTable)
→ commit
→ تحديث كاش الواجهة (localStorage مرآة فقط)
→ رفع غير متزامن (polling)
```

| ممنوع | مسموح في localStorage |
|-------|------------------------|
| العملاء / الزيارات / الفواتير / الحجوزات / المستخدمون كـ SoT | Theme / Language / Tab / حالة معالج مؤقتة |

فشل SQLite = العملية غير محفوظة = لا حدث مزامنة.

---

## 2) سياقات الفرع (منفصلة)

| المتغير | المعنى |
|---------|--------|
| `deviceBoundBranch` | قفل الجهاز الدائم |
| `selectedReportingBranch` | عرض/تقارير |
| `operationalWriteBranch` | الكتابة التشغيلية فقط |

Owner Mode = قراءة. Branch Mode يضبط `operationalWriteBranch` **دون** تغيير ربط الجهاز.

---

## 3) إنشاء فرع ذرّي

```text
Validate limits → reserve branchId → push license revision (CAS)
→ verify remote → finalize local → init sync checkpoint
→ Branch Mode فقط عند النجاح
```

فشل السحابة → `BRANCH_CREATION_PENDING` — ممنوع العمل التشغيلي على فرع نصف منشأ.

اختيار مصدر الإعدادات عند الإنشاء: `org_defaults` | `copy_branch` | `empty`  
(لا نسخ عملاء/فواتير/حضور).

---

## 4) الرفع / السحب

- Push: من SQLite + outbox حسب `branchId`.
- Pull: poll ~15ث؛ جهاز مقفول لا يسحب فروعاً أخرى.
- بعد Restore: **سحب الأحدث ومواءمة أولاً — ممنوع Push فوري لنسخة قديمة.**

---

## 5) النسخ الاحتياطي

أسماء الواجهة: المزامنة المستمرة · نسخة محلية · نسخة سحابية · استعادة.

أنواع النطاق: Device Full · Branch · Organization — مع manifest (`centerId`, `branchIds`, `syncCheckpoint`, …).

**pre-restore backup إلزامي** عند وجود بيانات محلية.

---

## 6) RBAC

```text
Protected IPC → authoritative session in main
→ if users KV empty: seedUsersIfEmpty → bind → retry
→ else DENY (لا ثقة بـ Renderer claim)
```

---

## 7) Google Sheets / Vault

تكامل تفعيل الترخيص عبر Apps Script — ليس SoT تشغيلي.  
Drive `license.json` الموقّع هو مرجع الفروع/الأجهزة وقت التشغيل.

---

## 8) قائمة تحقق سريعة

1. SQLite primary مفعّل بعد الترحيل.  
2. بعد الاستعادة: مواءمة (pull) قبل أي رفع.  
3. Add Branch → إما نجاح ذرّي أو PENDING.  
4. Logout: تأكيد Electron أصلي.  
5. لا تصف المزامنة بأنها لحظية — near-real-time فقط.
