# مواصفة المنتج المبني حالياً — تحديث ما بعد المعالجة

هذه الوثيقة هي **delta specification** للمواصفة المستقلة الأصلية `audit-output/as-built-independent-audit/AS-BUILT-SPECIFICATION.md`. تصف هذه الوثيقة السلوك الفعلي للمصدر بعد المعالجة المنفذة، ولا تدّعي إغلاق backlog المعمارية أو CSS غير المنفذ.

## 1. عقود المنتج الحالية

| المجال | العقد الحالي | الواجهة/الجهة المالكة |
|---|---|---|
| بدء التطبيق | تظهر واجهة الدخول أو BootFlow بحسب حالة setup؛ hydrate المستخدمين يعمل في الخلفية ولا ينجح صامتاً عند failure | `index.html`, `cloud/boot-flow-ui.js` |
| بيانات الدخول | SQLite committed هو المصدر الموثوق عند توفره؛ cache/DB renderer لا يتغلب عليه | `cloud/auth-credential-truth.js` |
| الدخول | `doLogin()` يوقف المصادقة عند hydrate rejected أو `{ok:false}` أو timeout ويعرض خطأ قابلًا للمحاولة | `index.html` |
| seed المالك | لا يبدأ seed أو reconciliation اللاحق بعد فشل readiness؛ المسار القانوني يظل محكوماً بـ`shouldBlockOwnerSeed` | `index.html`, `AuthCredentialTruth` |
| سياق الفرع | create/update metadata يتطلب branch explicit أو active/locked موثوق؛ لا يوجد fallback تشغيلـي إلى `BR-MAIN` | `cloud/record-metadata.js` |
| المزامنة | push/pull/poll وmanifest Drive ترفض `branch_context_required` عند غياب branch موثوق | `cloud/sync-engine.js`, `cloud/drive-adapter.js` |
| OAuth وDrive قبل الجلسة | الربط والإعداد فقط في bootstrap context يصدره main؛ listing/download/upload/verify سحابية تحتاج session | `electron/rbac-session.js`, `electron/main.js` |
| restore قبل الجلسة | restore ليس public؛ يعتمد على capability أحادية الاستخدام ومربوطة بالـwebContents والنطاق والملف/المركز/الفرع | `electron/bootstrap-restore-capability.js` |
| البحث | صفحة `page-search` المتقاعدة غير موجودة؛ route legacy `search` يوجه إلى `clients`؛ بحث العملاء والفواتير هما السطحان القانونيان | `index.html` |
| الإتاحة | عند startup والتنقل، تُربط labels غير المرتبطة بالحقل المناسب إن لم يكن للحقل اسم ARIA/عنوان قائم | `cloud/ux-a11y.js`, `index.html` |

## 2. خريطة الصفحات الحالية

التطبيق يحتوي على dashboard، التسجيل اليومي، الحجوزات، العملاء، الفواتير، الأطباء، الموظفين، الرواتب/المستحقات، المخزون، التقارير، الإعدادات، مركز المالك، وشاشة الطابور وغيرها من الصفحات المكتشفة سابقاً. لا توجد صفحة البحث المستقلة المتقاعدة. تظل مسؤوليات Daily وSettings كثيفة؛ لم يُنفذ split معماري لها في هذه الدورة لأن ذلك يحتاج UAT workflow ومراجعة policy للعمليات المالية والتشغيلية.

| الصفحة/المسار | المسؤولية التشغيلية | حالة التغيير |
|---|---|---|
| Login / BootFlow | دخول موثوق أو استكمال إعداد المركز | تحسين حقيقة hydrate فقط |
| Dashboard | ملخص اليوم وروابط الدور | بلا تغيير مسؤولية |
| Daily | تسجيل الزيارة والخدمة والمدفوعات والسجل اليومي | بلا تغيير قواعد مالية |
| Bookings | إنشاء وإدارة الموعد | بلا تغيير قواعد الحجز |
| Clients / Invoices | البحث القانوني للعميل والفاتورة | استقبل route البحث المتقاعد |
| Settings → حماية البيانات | الربط والنسخ والتحديث بين الأجهزة | تحسين المصطلحات والإتاحة |
| Owner Hub | الترخيص والفروع والأجهزة وحالة حماية البيانات | title/description وظيفيان |
| Reports | نتائج وتقارير قابلة للفلترة | فحص labels runtime ضمن العينة |

## 3. تجربة حماية البيانات باللغة الحالية

لا تظهر البطاقات الرئيسية أسماء مثل `Cloud V2` أو `Push + Poll` أو `Backup V1/LevelDB` كشرح للمستخدم. اللغة المعروضة هي: **حماية البيانات والتحديث بين الأجهزة**، **ربط حساب Google**، **تحديث بين الأجهزة**، **النسخ الاحتياطي الرسمي**، **معرّف الدعم** و**فترة التحديث**. تبقى أسماء الدوال والمفاتيح الداخلية كما هي لتجنب تغيير عقود التكامل.

## 4. حالات الفشل والتعافي

| التدفق | failure state | سلوك المستخدم |
|---|---|---|
| hydrate credentials | `auth_hydration_failed` أو `auth_hydration_timeout` | لا اختيار مستخدم/seed/login اعتماداً على بيانات غير موثوقة؛ تظهر رسالة إعادة المحاولة |
| metadata بلا branch | validation ناقصة `branchId` | لا ينسب السجل تلقائياً إلى فرع آخر |
| sync بلا branch | `branch_context_required` | لا ينشأ مسار Drive أو pull/push افتراضي |
| OAuth قبل جلسة عادية | `rbac_bootstrap_phase_required` | يمر فقط عبر خطوات setup التي يثبتها main |
| cloud data قبل session | `rbac_session_required` | لا list/download/upload/verify لمحتوى السحابة |
| restore pre-login | capability مفقودة/منتهية/خارج scope | `restore_authorization_required` أو denial مرتبط بالنطاق |

## 5. اختبارات runtime الحالية

أثبت Smoke Electron في profile معزول أن واجهة المصدر وASAR الجديدين يحمّلان دون أخطاء console. وأثبت smoke labels أن صفحة الدخول وصفحات Daily وBookings وSettings وReports لا تحتوي، ضمن surface الظاهر المختبر، عناصر `input/select/textarea` غير معطاة اسماً accessible بعد تطبيق primitive. هذه النتيجة لا تغني عن UAT على Windows أو عن جميع الحوارات الديناميكية والبيانات الحقيقية.

## 6. حدود المواصفة

لا تغلق هذه النسخة ديون CSS/design system أو استخراج وحدات `index.html` أو كل legacy authority. تظل هذه عناصر backlog موثقة في `FINAL-REMEDIATION-EXECUTION-AR.md` و`MASTER-REMEDIATION-PROGRAM.md`. 
