# برنامج المعالجة الرئيسي وإغلاق العيوب

**المصدر المرجعي:** التقرير الخصومي النهائي وسجل الأدلة في `audit-output/adversarial/`.  
**هدف النجاح:** لا يعد العيب مغلقاً إلا بعد إصلاح السبب الجذري، إضافة اختبار انحدار، نجاح الاختبارات القائمة ذات الصلة، تحقق تشغيلي آمن حيث يمكن، وعدم بقاء مسار legacy أو مصدر سلطة بديل يعيد العيب.

> **استثناء منتج معتمد من المستخدم:** يبقى `google.clientId` و`google.clientSecret` المضمّنان في التطبيق كما هما. لا يدخلان ضمن تغيير الكود أو الإغلاق، لكن تظل مراجعة scopes والتدوير وسياسات عدم وضع رموز مستخدمين داخل الحزمة قائمة.

## ترتيب التنفيذ والتبعيات

| المرحلة | الغرض | لا تبدأ قبل | بوابة الخروج |
|---|---|---|---|
| 0 | لقطة خط أساس وسجل إغلاق واختبارات انحدار | — | لا تعديلات غير موثقة، وكل P0 له اختبار فاشل قبل الإصلاح. |
| 1 | سلطة main وIPC ومسارات filesystem | 0 | لا bootstrap role من renderer، وكل قناة حساسة default-deny. |
| 2 | SQLite كمصدر حقيقة للبيانات والجلسة والفرع | 1 | لا raw localStorage للبيانات التشغيلية، وcommit مؤكد قبل UI success. |
| 3 | استعادة ونسخ وترحيل ذات حالة commit صادقة | 2 | rollback/commit boundary مثبتة، والتحقق الصارم يمر. |
| 4 | sync/outbox/conflict/baseline متعددة الأجهزة | 2 و3 | claim حصري، READY مشتق من SQLite، ولا version advance بعد failure. |
| 5 | الفروع والترقيات والـ legacy compatibility | 2 و4 | لا branch fallback صامت ولا run عالق. |
| 6 | error truth وlifecycle/performance وواجهة | 1–5 | لا false success/failure، وإدارة timers/listeners محددة. |
| 7 | إعادة اختبار كامل وElectron security/adversarial | 1–6 | كل اختبارات الانحدار وCore تمر. |
| 8 | بناء حزمة Windows حديثة وفحصها واختبار الممكن | 7 | artifact جديد موثق، وفحص asar وElectron وWindows-runtime قدر البيئة. |
| 9 | إعادة تدقيق وقرار إصدار | 8 | كل سجل أدناه Closed أو له مانع بيئي معلن؛ لا P0 مفتوح. |

## سجل الإغلاق

| المعرف | الشدة | السبب الجذري والملفات/الدوال | أقل إصلاح صحيح | الاختبار/قبول التشغيل | التوافق والـ rollback |
|---|---|---|---|---|---|
| ADR-SEC-001 | P0 | renderer يمرر users إلى `database:seedUsersIfEmpty`; الملفات: `electron/preload.js`, `electron/main.js`, `electron/rbac-session.js`, `electron/database/service.js`; الدوال `seedUsersIfEmpty`, `bindSession` | حذف seed العام؛ main ينشئ أول owner من capability موقعة أحادية الاستهلاك وحالة SQLite دائمة | renderer غير موثوق لا ينشئ owner؛ capability صحيحة تنشئه مرة واحدة؛ restart يثبت السلطة | مسار migration-only لمالك قديم، rollback قبل استهلاك capability فقط |
| ADR-SEC-002 | P0 | سياسة RBAC تسمح غير المعرف؛ `electron/rbac-session.js:assertChannelAllowed`, `electron/backup-v2-ipc.js` deleteLocal | default-deny وسياسة صريحة owner-only؛ backup ID بدلاً من path؛ `realpath` containment | employee يرفض؛ DB/settings/absolute/symlink paths ترفض؛ backup authorized فقط يحذف | لا حذف API قديم في runtime؛ adapter compatibility يحول ID فقط |
| ADR-SEC-003 | P0 | `electron/bootstrap-restore-capability.js` يقبل `licenseSnapshot` من renderer | إصدار capability فقط من ترخيص main موثق وfile token من native/main | snapshot مزور يرفض؛ bootstrap موثق ينجح ويستهلك token مرة واحدة | لا fallback IPC؛ دعم discovery الموثق فقط |
| ADR-SYNC-005 | P0 | `cloud/db-bridge.js:rawDb/install`, `cloud/repository.js:createLocalStorageAdapter,setAll,upsert,delete` تكتب raw localStorage | Repository adapter SQLite/main awaitable؛ transaction واحدة للبيانات+revision+outbox؛ لا UI success قبل commit | تعديل cases ثم restart ثم backup/restore يطابق SQLite/واجهة/outbox | import legacy read-only ثم migrate إلى SQLite؛ rollback عبر backup قبل schema switch |
| ADR-RST-001 | P0 | `electron/backup-restore-coordinator.js:restore,verifyCountsAgainstManifest` يفصل DB swap عن post-process ويرفض فقط expected>0 | restore journal وcommit fence؛ rollback handle حتى reopen/rehydrate/strict verify؛ equality تشمل صفر | fail reopen/rehydrate يعيد الحالة أو يعلن COMMITTED_POST_PROCESSING_FAILURE؛ zero count mismatch يفشل | recovery on startup من journal؛ لا success/failure غامض |
| ADR-RST-002 | P1 | `electron/backup-v2-ipc.js`, `backup-v2-scheduler.js:configure,tick`, قنوات backup غير مصنفة ومسار localPath حر | سياسات role صريحة، destinations مسجلة في main، retention على root مصرح فقط | employee لا يجدول/يحذف؛ manual/safety/pinned لا تتعرض للـ prune | migrate settings القديمة إلى destination ID |
| ADR-DATA-001 | P1 | `database/migrate-from-json.js`, `migration-safety.js:finalizeMigrationRun` تطبع نجاحاً مع إسقاط/فك علاقات وKV جزئي | quarantine report + fail/approved-loss policy + manifest KV كامل | orphan/duplicate يوقف أو يحتاج approval؛ absent KV يزال/يبطل ذرياً | snapshot original وreport قابل لاستئناف operator |
| ADR-DATA-002 | P1 | `database/upgrade-migration-orchestrator.js:runUpgradePipeline,resumeInProgressRun,assessUpgradeState` | run state machine دائمة؛ staging DB ثم verify/swap؛ old run superseded | kill at every stage، لا `in_progress` بعد resume ناجح | journal/recover; لا copy فوق DB مفتوح |
| ADR-SYNC-001 | P1 | `database/sync-outbox.js:claimPending,ack,fail` يسمح claim على inflight | CAS `pending→inflight` مع lease owner/token/expiry وربط ack/fail | عاملان يطالبان event؛ واحد فقط ينجح؛ lease expired يعاد بأمان | migration تضيف lease columns nullable ثم backfill |
| ADR-SYNC-002 | P1 | `cloud/sync-engine.js:applyRemoteVersions,pullBranchDatabase,pullConfigFile` يتجاهل فشل import ويحفظ versions | لا save VersionsIndex إلا بعد كل commit؛ aggregate result صادق؛ reconciliation marker | table failure/conflict يبقي version/baseline السابقين | retry من pending reconciliation لا fallback silent |
| ADR-SYNC-003 | P1 | `cloud/sync-baseline.js:save/load`, `cupping-sqlite-bridge.js`؛ lifecycle في localStorage | نقل baseline/reconciliation إلى `sync_meta` في main/SQLite | restart/restore يحافظ على gate؛ renderer لا يستطيع فرض READY | migrate local state مرة واحدة ثم delete |
| ADR-SYNC-004 | P1 | `cloud/table-merge-policy.js:overlappingFields,decideForTable,mergeComplementary` | role/password/active/branchScope/permissions strict conflict أو authority server-side | جهازان يغيران role/password؛ conflict لا merge صامت | owner/user schema compatibility وتحويل resolutions الموجودة |
| BR-001 | P1 | `database/migrations/001_initial.js`, `database/repositories/index.js`, `branch-slice.js`؛ PK `id` عالمي | PK/unique مركب `(branch_id,id)` أو global IDs موثقة؛ every query/upsert scoped | ID واحد في BR-A/BR-B يتعايش؛ forged/null branch يرفض main | migration transactional مع collision report |
| AUTH-001 | P1 | `cloud/auth-credential-truth.js`, `cupping-sqlite-bridge.js`, renderer auth lifecycle | SQLite/main credential authority واحد؛ verify→commit→reread→session bind→UI | old password fails post-commit؛ new succeeds after restart/restore | migrate owner profile/cache إلى read-only mirror |
| CACHE-001 | P1 | `electron/device-cache.js`, `cloud/device-cache.js`, `cloud/config-layer.js`؛ cache pre-auth mutable | main-only signed/validated cache writes، cache ليس authority للمستخدمين | cache write قبل login يرفض؛ stale account A لا يبقى بعد B | keep cache compatibility read-only then rehydrate |
| DEF-001 | P1 | `electron/security/window-policy.js`, inline scripts in `index.html` | CSP nonce/hash تدريجي وpermissions allowlist | CSP security test يمنع inline غير المصرح؛ navigation/permission tests تمر | staged CSP report-only ثم enforce |
| UI-BOOT-001 | P2 | `index.html` startup tasks و`dbSetGuarded` warnings | bootstrap read-only بلا writes، await truthful main readiness | login smoke بلا pre-auth write warnings؛ timeout يظهر state واضح | feature flags لا تخفي errors |
| PERF-001 | P2 | `cloud/sync-engine.js:start/stop`, `sync-coordinator.js`, `index.html` | lifecycle registry لكل timer/listener؛ startup timeout cancellable؛ metrics | repeated init لا يزيد cycles/listeners؛ memory/profile baseline | stop releases all tracked resources |
| E2E-001 | P1 | `scripts/pat-acceptance-test.mjs`, `scripts/fpa-final-audit.mjs`, `scripts/e2e-production-readiness.mjs` | Playwright Electron config وfixtures isolated؛ strict pass/fail؛ traces/video/console/network | deterministic reruns؛ no globals-only acceptance; artifact on failure | keep legacy scripts as non-gating compatibility until replaced |
| PKG-001 | P1 | `package.json:build`, `scripts/run-win-build.cjs` | Windows release gate: signature, native ABI, install/upgrade/uninstall/UAT; OAuth embedding intentionally kept | fresh EXE/ASAR SHA256، Windows UAT and Authenticode recorded | build rollback uses prior signed artifact and retained userData policy |

## مسارات يجب حذفها أو تعطيلها بعد النقل

| المسار | القرار |
|---|---|
| renderer-originated `database:seedUsersIfEmpty` production path | **DELETE** بعد migration-only first-owner adapter |
| unclassified backup IPC fallback | **DELETE**؛ كل channel يجب policy صريحة |
| raw localStorage Repository adapter للـ synced/operational tables | **DELETE**؛ يجوز localStorage كـ UI cache غير authoritative فقط |
| bootstrap `licenseSnapshot` authority fallback | **DELETE** |
| direct production restore paths خارج `BackupRestoreCoordinator` | **DELETE أو COMPATIBILITY_ONLY** مع telemetry ورفض production |
| legacy E2E globals scripts كـ release gate | **COMPATIBILITY_ONLY** حتى Playwright Electron gate بديل |

## مصادر سلطة الهدف بعد الإغلاق

| الحالة | السلطة الوحيدة | ملاحظات |
|---|---|---|
| credentials, owner, mustChangePassword, RBAC session | SQLite/main-process | renderer يملك mirror فقط |
| branch/device/center/license binding | SQLite/main + signed device identity | لا fallback BR-MAIN إلا migration محدد |
| operational data, revisions, outbox, conflicts, tombstones | SQLite transaction في main | localStorage cache فقط |
| restore state/journal | SQLite/main + journal filesystem مقيد | UI يقرأ حالة فقط |
| sync baseline/lifecycle/readiness | SQLite `sync_meta`/outbox/conflicts | READY مشتق لا مخزن في renderer |
| wizard/cache | derived cache main-validated | لا مصدر auth أو user authority |

## متطلبات خروج البرنامج

لا يصدر artifact جديد إلا مع: نجاح كل اختبارات الانحدار أعلاه؛ `npm test` وlint؛ تشغيل Electron على profile نظيف؛ build حديث بعد التعديلات؛ SHA256 للـ EXE وASAR؛ والتحقق على Windows أصلي للتثبيت/التشغيل/التوقيع/native SQLite أو توثيق مانع بيئي صريح.

## سجل تنفيذ المعالجة — 2026-08-23

| البند | حالة التنفيذ | الدليل المتاح | القيود أو العمل المتبقي |
|---|---|---|---|
| ADR-SEC-001 وADR-SEC-003 | **معالج في المصدر ومختبر وحدوياً** | إزالة seed العام، first-owner main-only بتوكن/وثيقة مرخصة، ونجاح `test-p0-authority.js` و`test-first-owner-main-authority.js` | لا تحقق Windows أصلي أو SQLite native في هذه البيئة. |
| ADR-SEC-002 | **معالج في المصدر ومختبر وحدوياً** | default-deny، سياسات IPC كاملة، containment/staging لمسارات Backup V2، ونجاح اختبارات IPC/path containment | يلزم UAT Windows للـnative dialogs ومسارات المستخدم الحقيقية. |
| ADR-SYNC-005 وAUTH-001 | **معالج جزئياً إلى حد اختبارات mock/renderer** | Repository/DbBridge/SyncedWrite SQLite-authoritative، committed users في Electron، واختبارات authority/config الناجحة | يلزم SQLite native وملف مستخدم فعلي للتحقق من الترحيل والـrestart. |
| ADR-RST-001 وADR-RST-002 | **معالج في المصدر ومختبر وحدوياً** | rollback truthful، zero-count mismatch، single-flight، retention classification، containment؛ اختبارات المرحلة 4 ناجحة | يلزم fault injection على SQLite/Windows حقيقي. |
| ADR-DATA-001 وADR-DATA-002 | **معالج في المصدر ومختبر وحدوياً/ساكن** | JSON quarantine، resume يعيد استخدام النسخة الأصلية ويتحقق قبل completed، وترحيل branch legacy موسع | اختبارات migration المتكاملة محجوبة بسبب SIGSEGV في `better-sqlite3` على Linux/Node 22. |
| ADR-SYNC-001 إلى ADR-SYNC-004 | **معالج في المصدر ومختبر وحدوياً** | CAS+lease token/expiry، منع stale ack، صدق VersionsIndex، lifecycle commit awaited، users protected-fields conflicts | يلزم اختبار جهازين حقيقيين/SQLite native وGoogle disposable account. |
| BR-001 | **حظر فوري ومعالجة ترحيل جزئية** | لا fallback صامت لـBR-MAIN في branch-slice، كشف collision وbranch null، اختبار `test-branch-identity-fail-closed.js` ناجح | لم تنفذ هجرة PK مركبة شاملة؛ السياسة الحالية fail-closed وتتطلب ترحيل legacy/قرار operator. |
| PKG-001 | **بناء وفحص artifact جديدان؛ لا UAT Windows أصلي** | `npm run build:dir` نجح، ASAR تطابق مع المصدر، Linux Electron ASAR smoke نجح | لا Wine/QEMU/Windows host ولا أدوات Authenticode؛ لا يجوز إعلان تشغيل/توقيع EXE على Windows. |

### نتائج بوابات التحقق الأخيرة

| البوابة | النتيجة | التفاصيل |
|---|---:|---|
| اختبارات remediation المضافة | **PASS** | 16 اختباراً غير تفاعلياً دُمجت في `tests/run-all.js` ونجحت داخل `npm test`. |
| فحص صياغة الملفات المعدلة | **PASS** | سجل `audit-output/adversarial/post-remediation-source-syntax-gate.log`. |
| Electron source UI smoke | **PASS** | نافذة المصدر حُمّلت تحت Xvfb بلا console errors. |
| Electron ASAR UI smoke | **PASS** | ASAR المعبأ حُمّل تحت Electron Linux/Xvfb بلا console errors؛ ليس بديلاً عن تشغيل EXE Windows. |
| `npm run verify:sensitive` | **PASS** | 130/130 لاختبارات licensing، وفحوص attendance/ledger/tax/backup/import ناجحة. |
| `npm test` | **FAIL — 112/147** | 18+ حالات SIGSEGV مرتبطة بـ`better-sqlite3` في Linux/Node 22، إضافة إلى اختبارات legacy تتوقع seed/cache public أو سلوكاً قديماً، وفشل `verify:cloud-v2` يحتاج تحقيقاً قبل القبول. |
| `npm run lint` | **FAIL — baseline tooling** | يشمل `audit-output/adversarial/*.js` وأخطاء lint قديمة؛ lint المستهدف لمنسق الترقية المعالج PASS. |
| Windows build directory | **PASS** | `dist/win-unpacked` بني بتاريخ 2026-08-23؛ build log محفوظ. |

> **قرار مرحلي:** لا تزال النتيجة **NO — BLOCKERS REMAIN**. الإصلاحات المصدرية والحزمة الجديدة حققت أدلة إيجابية، لكنها لا تستوفي بوابة إصدار الإنتاج قبل معالجة/تصنيف فشل `verify:cloud-v2` والاختبارات non-SIGSEGV، وإجراء UAT أصلي على Windows مع SQLite native وتوقيع Authenticode أو توثيق قرار توقيع رسمي.

## بصمات artifact المعبأ

| العنصر | القيمة |
|---|---|
| الإصدار | `2.0.1` |
| Source tree SHA-256 | `e8c17e8e6f264e73001d0797ec9183baa92f5e29940d9ec20c463438f117cfee` |
| EXE | `dist/win-unpacked/Hijama Management System.exe` |
| EXE SHA-256 | `8f9a3827eb8eb5cbd845c4a919247fe63c37125df1e6a8b9ecc66100d5c76840` |
| ASAR | `dist/win-unpacked/resources/app.asar` |
| ASAR SHA-256 | `9e1e5359d719c673c00a6bf493918f9a9c3e60bd0a85b9a34fbcf66094ffca60` |

> تم الإبقاء على OAuth Client ID وClient Secret كما طلب المستخدم صراحةً؛ لم تُطبع قيمهما ولم يعاملا كعيب مطلوب الإصلاح.

