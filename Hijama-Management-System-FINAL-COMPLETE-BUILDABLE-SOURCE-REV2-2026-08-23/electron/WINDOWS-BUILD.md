# بناء نظام إدارة مراكز الحجامة لـ Windows

## المتطلبات

- Windows 10/11 (64-bit)
- [Node.js 20 LTS](https://nodejs.org/) أو أحدث
- اتصال إنترنت لأول `npm install`

## خطوات التحويل إلى برنامج Windows

```bash
git clone https://github.com/7uzzam/Tadawi-no-logs.git
cd Tadawi-no-logs
git checkout cursor/electron-print-ui-fixes-d976
npm install
npm start
```

بعد التأكد من عمل التطبيق:

```bash
npm run build
```

## المخرجات

| الملف | الوصف |
|-------|--------|
| `dist/CuppingCenter-Setup-2.0.0.exe` | **المثبت** — وزّعه للمستخدمين |
| `dist/win-unpacked/` | نسخة مفكوكة للاختبار فقط — لا توزّع |

## التوقيع الرقمي (Code Signing)

بدون شهادة، Windows SmartScreen قد يظهر تحذير «Windows protected your PC» عند أول تشغيل. هذا طبيعي للبرامج غير الموقّعة.

### الحل الموصى به (إنتاج)

1. شراء شهادة **Code Signing** من جهة موثوقة (DigiCert، Sectigo، SSL.com) — تقريباً 200–400 USD/سنة
2. نوع **Standard OV** أو **EV** (EV يقلل تحذيرات SmartScreen أسرع)
3. عند البناء، عيّن متغيرات البيئة:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
npm run build
```

4. في `package.json` غيّر `"signAndEditExecutable": false` إلى `true` بعد توفر الشهادة

### بدائل مؤقتة

- توزيع المثبت داخلياً مع تعليمات للمستخدم: «More info → Run anyway»
- رفع الملف على VirusTotal ومشاركة الرابط مع العملاء لطمأنتهم
- **لا** يوجد توقيع مجاني رسمي من Microsoft للبرامج التجارية

## استبدال الأيقونة والشعارات

الملفات الثلاثة فقط (راجع `branding/README.md`):

| الملف | الاستخدام |
|-------|-----------|
| `build/Program-Icon.ico` | أيقونة البرنامج — EXE، شريط المهام، المثبت (تُولَّد تلقائياً من `buildIcons.iconSource` إذا كانت غير صالحة) |
| `assets/NajjarTech-Logo.png` | شعار NajjarTech — المثبت، About، معلومات البرنامج |
| `branding/Center-Logo.png` | شعار المركز الافتراضي داخل التطبيق |

> **ملاحظة:** ملفات BMP في `build/` تُولَّد تلقائيًا من `NajjarTech-Logo.png` — لا تُعدَّل يدويًا.

## Branding Engine

**`branding.config.json`** — التفاصيل في **`branding/README.md`**

```bash
npm run generate:brand   # توليد BMP + installer-branding.nsh
npm run audit:brand      # Final Branding Audit
npm run build            # prebuild يشغّل generate:brand تلقائيًا
```

الملفات المُولَّدة:
- `build/Installer-Sidebar.bmp`
- `build/Uninstaller-Sidebar.bmp`
- `build/Installer-Header.bmp`
- `build/installer-branding.nsh`

> **`Program-Icon.ico`**: يُولَّد تلقائياً عبر `npm run generate:brand` من `branding/Center-Logo.png` (أو `buildIcons.iconSource`). إذا كان الملف `.ico` تالفاً (مثلاً JPEG بامتداد خاطئ) يفشل NSIS بـ `invalid icon file`.

ثم أعد البناء: `npm run build`

## إعداد الطابعة (بعد التثبيت)

1. الإعدادات → الطابعات والأجهزة
2. زر **اختيار** → اختر الطابعة الحرارية
3. اختبار الطباعة + فتح درج الكاشير
