# تقرير إعادة التدقيق بعد المعالجة وبناء حزمة Windows

**التاريخ:** 23 أغسطس 2026  
**المنتج:** Hijama Management System / Tadawi، الإصدار `2.0.1`  
**قرار الإصدار:** **NO — BLOCKERS REMAIN**

> تم تنفيذ معالجة مرتبة بالتبعيات، وإعادة بناء artifact Windows جديد، وفحص محتوى الحزمة وتشغيل كود ASAR المعبأ في Electron تحت Linux/Xvfb. إلا أن أدلة الإصدار لا تزال غير كافية لاعتماد الإنتاج أو الادعاء بأن التطبيق أصبح خالياً من العيوب؛ لذلك القرار المتحفظ هو **عدم الاعتماد حتى إغلاق الموانع التالية**.

## الملخص التنفيذي

انخفضت مساحة المخاطر الحرجة في المصدر بصورة ملموسة. أُزيل مسار إنشاء/زرع المستخدمين من renderer، وأصبح تدفق أول مالك مقيداً بالعملية الرئيسية وبوثيقة ترخيص/توكن موثوقين. كما فُرض **default-deny** على IPC، وحُصرت مسارات النسخ والاستعادة المحلية، وأصبحت استعادة ما بعد commit صادقة في الإبلاغ عن rollback أو committed post-processing failure. أُصلح outbox إلى claim ذري مؤجر، وربط `ack` و`fail` بملكية lease الحالية، وصارت حقول المستخدمين الحساسة تؤدي إلى conflict بدلاً من دمج صامت.[1] [2]

أنتج البناء الجديد مجلداً Windows صالحاً بنيوياً (`win-unpacked`) وتحقق فحص ASAR من تضمين ملفات الإصلاح ومطابقتها للمصدر عند البناء. كما نجح smoke test للمصدر وASAR بلا أخطاء console تحت Electron/Linux. لكن لم تكن بيئة Windows أو Wine/QEMU أو أدوات Authenticode متاحة، لذلك **لم يُشغَّل ملف EXE على Windows ولم يُتحقق من توقيعه**.[3] [4]

| البعد | النتيجة | الحكم |
|---|---:|---|
| اختبارات المعالجة الجديدة | 16/16 PASS | إيجابي |
| فحص صياغة الملفات المعدلة | PASS | إيجابي |
| مصدر Electron UI smoke | PASS | إيجابي |
| ASAR المعبأ UI smoke | PASS | إيجابي، لكنه ليس Windows UAT |
| `npm run verify:sensitive` | PASS، ومنها 130/130 licensing | إيجابي |
| `npm test` | 112/147 PASS | غير مقبول كبوابة إصدار |
| `npm run lint` | FAIL بسبب نطاق lint/ملفات أدلة قديمة | يحتاج ضبط/معالجة |
| بناء Windows حديث | PASS | إيجابي |
| تشغيل EXE على Windows وتوقيع Authenticode | غير منفذ | مانع إصدار |

## الإصلاحات المنفذة

| المجال | علاج السبب الجذري | اختبار الانحدار/الدليل |
|---|---|---|
| السلطة وIPC | إزالة `database:seedUsersIfEmpty` من preload/main والواجهة؛ policy غير مصنفة ترفض افتراضياً؛ منع حساب `__dev__` في الإنتاج؛ ربط bootstrap/uninstall بسياق main موثوق | `test-p0-authority.js` و`test-ipc-policy-completeness.js` PASS |
| أول مالك وcredentials | تدفق setup-token موقّع في main ومعاملة SQLite ذرية؛ renderer لا ينشئ أو يرقّي أول owner؛ credentials في Electron تقرأ committed SQLite | `test-first-owner-main-authority.js` و`test-auth-credential-authority.js` PASS |
| مصدر الحقيقة | Repository/DbBridge/SyncedWrite تمر عبر commits SQLite منتظرة؛ ConfigLayer وattachment metadata لا تعلن نجاحاً قبل commit | `test-repository-sqlite-authority.js` و`test-config-authoritative-commit.js` PASS |
| النسخ والاستعادة | staging وcontainment لملفات Backup V2؛ حماية النسخ اليدوية/safety/pinned؛ single-flight restore؛ rollback صادق بعد post-commit failure | `test-restore-postcommit-truth.js` و`test-backup-local-path-containment.js` و`test-backup-retention-classification.js` PASS |
| الترحيل | quarantine قبل ترحيل JSON عند orphan/duplicate/KV غير ممثل؛ resume يعيد استخدام النسخة الأصلية ويتحقق قبل وضع run مكتمل | `test-json-migration-quarantine.js` و`test-upgrade-resume-truth.js` PASS |
| المزامنة | `pending → inflight` CAS ضمن transaction مع token/expiry؛ stale worker لا يؤكد lease جديداً؛ لا VersionsIndex عند فشل pull؛ lifecycle commit منتظر | `test-sync-outbox-lease.js` و`test-sync-version-truth.js` و`test-sync-lifecycle-authoritative-commit.js` PASS |
| تعارض المستخدمين | كلمات المرور والأدوار والحالة ونطاق الفرع والصلاحيات وحقول lifecycle تتحول إلى conflict صريح | `test-user-merge-protected-fields.js` PASS |
| هوية الفروع | منع fallback الصامت إلى `BR-MAIN`، رفض `branch_id` المفقود وID الموجود في فرع آخر، وتوسيع كشف legacy branch إلى employees/attendance | `test-branch-identity-fail-closed.js` PASS |

## أدلة الحزمة الجديدة

تم بناء الحزمة بالأمر `npm run build:dir` بنجاح بعد المعالجة. أكد فحص `app.asar` وجود ملفات الإصلاح ومطابقتها للمصدر عند البناء، ثم حمّل Electron/Linux ملف ASAR نفسه ووصل إلى واجهة التطبيق بلا أخطاء console.[3] [5]

| عنصر artifact | القيمة |
|---|---|
| EXE | `dist/win-unpacked/Hijama Management System.exe` |
| EXE SHA-256 | `8f9a3827eb8eb5cbd845c4a919247fe63c37125df1e6a8b9ecc66100d5c76840` |
| ASAR SHA-256 | `9e1e5359d719c673c00a6bf493918f9a9c3e60bd0a85b9a34fbcf66094ffca60` |
| ZIP التسليم الكامل | `dist/Hijama-Management-System-2.0.1-win-unpacked-post-remediation.zip` |
| ZIP SHA-256 | `ce2a8bdacfb654d8db0d95daccd46b6e32fddf47a9c945e2a95dee2bdc90382f` |
| Source tree SHA-256 | `e8c17e8e6f264e73001d0797ec9183baa92f5e29940d9ec20c463438f117cfee` |
| فحص ASAR | PASS لستة ملفات علاجية ممثلة |
| ASAR UI smoke | PASS؛ `bodyTextLength=652` و`consoleErrors=[]` |

> فحص ASAR هو دليل مهم على تضمين الكود المصلح، لكنه لا يثبت صحة تشغيل EXE على Windows ولا صلاحية DLL/ABI أو التثبيت/الترقية/الإزالة في بيئة المستخدم الفعلية.

## الموانع المتبقية

| الأولوية | المانع | الأثر | الإجراء اللازم |
|---|---|---|---|
| P0/إصدار | لا توجد بيئة Windows native أو Wine/QEMU، ولا أدوات Authenticode | لا يمكن اختبار EXE أو تثبيته أو التحقق من التوقيع | Windows x64 نظيف: install, launch, login, first-owner, SQLite, backup/restore, upgrade/uninstall، ثم `signtool verify` |
| P1 | `npm test` انتهى عند 112/147 | بوابة regression الكاملة غير خضراء | عزل وإصلاح الفشلات غير المرتبطة بـSIGSEGV، ثم إعادة التشغيل؛ الاستمرار في توثيق native SIGSEGV كمحدد بيئي مستقل |
| P1 | 18+ حالات `SIGSEGV` لـ`better-sqlite3` على Linux/Node 22 | لا يمكن تنفيذ DB integration/fault migration محلياً | تنفيذ تلك المصفوفة على Windows/Node ABI المنتج أو runner Linux متوافق؛ لا تُفسر كنجاح |
| P1 | `verify:cloud-v2` يفشل في `apply remote versions` | تدفق sync/cloud لا يملك إثبات قبول نهائي | تحقيق منفصل على حساب/مجلد Google disposable، وإصلاح أو تحديث expectation إن كان الاختبار legacy فقط |
| P1 | اختبارات legacy تتوقع seed/cache public أو RBAC قبل-session | تعارض ظاهر بين ضوابط الأمان الجديدة وexpectations القديمة | تحديث الاختبارات لتتوقع الرفض الموثوق، لا إعادة فتح القنوات العامة |
| P1 | lint شامل يفحص `audit-output/adversarial/*.js` ويحتوي أخطاء baseline | لا توجد بوابة lint شاملة موثوقة | استبعاد أدلة التدقيق من lint أو ضبط `eslint` environments؛ ثم معالجة أخطاء source الحقيقية |
| P1 | BR-001 في وضع fail-closed وليس هجرة PK مركبة مكتملة | بيانات legacy متعددة الفروع لن تتحرك تلقائياً | قرار منتج ومهاجرة SQLite مجرّبة: PK/unique مركب أو global IDs موثقة، مع تقرير collision وrollback |
| P1 | لم يجر اختبار Google حقيقي أو جهازين | لا إثبات E2E لمزامنة distributed | حسابات/مجلدات disposable وجهازان/بروفايلان مستقلان |

## ملاحظات النطاق والامتثال

بناءً على الاستثناء الصريح من المستخدم، **لم تُزل أو تُغير** OAuth Client ID وOAuth Client Secret المضمّنان، ولم تُطبع قيمتهما في هذا التقرير أو سجلات التسليم. لا يُعد ذلك عيباً مطلوب الإصلاح ضمن هذا البرنامج.

النتائج الوحدوية وASAR smoke لا تعني أن التطبيق خالٍ من العيوب. القرار النهائي الصحيح حالياً هو **NO — BLOCKERS REMAIN**، وليس "جاهز للإنتاج" ولا "READY FOR FINAL HUMAN ACCEPTANCE UAT". بعد تنفيذ UAT Windows وإغلاق فشل sync/cloud وبوابة الاختبارات، يمكن إعادة التقييم إلى **READY FOR FINAL HUMAN ACCEPTANCE UAT** فقط، وليس ضماناً مطلقاً.

## المراجع والأدلة

[1]: `REMEDIATION-PROGRAM.md` — سجل التنفيذ، قرارات الإغلاق، والحدود المتبقية.
[2]: `tests/remediation/` — اختبارات الانحدار الجديدة المدمجة في `tests/run-all.js`.
[3]: `audit-output/adversarial/windows-dir-build-post-remediation.log` و`windows-artifact-post-remediation.txt` — نجاح البناء، البصمات، وفحص artifact.
[4]: `audit-output/adversarial/windows-runtime-availability-check.log` — يثبت غياب Windows/Wine/QEMU وأدوات التنفيذ المتاحة.
[5]: `audit-output/adversarial/packaged-asar-electron-ui-smoke.log` و`windows-package-content-match-rerun.log` — smoke للـASAR وتطابق الملفات المعبأة.
[6]: `audit-output/adversarial/npm-test-post-remediation.log` و`lint-post-remediation.log` — نتائج البوابات الفاشلة وتصنيفها.
[7]: `audit-output/adversarial/sensitive-verification-post-remediation.log` — نجاح `verify:sensitive` و130/130 لاختبارات licensing.
