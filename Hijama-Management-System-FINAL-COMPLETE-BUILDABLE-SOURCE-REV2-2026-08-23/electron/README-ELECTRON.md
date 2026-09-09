# ربط نظام مركز الحجامة (Cupping Center) مع Electron

هذا الدليل يوضح كيف تربط واجهة `index.html` مع تطبيق Electron Desktop بكامل قدرات الطباعة والنسخ الاحتياطي والمزامنة.

## الهيكل المقترح

```
cupping-center-desktop/
├── package.json
├── electron/
│   ├── main.js          ← العملية الرئيسية
│   ├── preload.js       ← الجسر الآمن (contextBridge)
│   ├── messaging.js     ← بوابة الرسائل (delegates to gateway)
│   ├── communication/     ← Communication Gateway
│   │   ├── gateway.js
│   │   ├── queue.js
│   │   ├── webhook-server.js
│   │   └── providers/   ← 4jawaly, Taqnyat, urWhats, …
│   └── devices.js       ← الطابعات + درج الكاشير
├── app/
│   └── index.html       ← نقطة الدخول (مع كل ملفات cupping-*.js)
```

## 1) تثبيت الحزم

```bash
npm init -y
npm install electron escpos escpos-usb node-thermal-printer
```

## 2) preload.js — الجسر

انسخ `electron/preload.example.js` إلى `electron/preload.js`. يعرّض:

- `window.cuppingElectron` — الاسم الرسمي
- `window.tadawiElectron` — alias للتوافق مع إصدارات قديمة

## 3) main.js — تسجيل IPC handlers

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { openCashDrawer, printThermal, printA4, listPrinters, getDeviceStatus } = require('./devices');
const { sendWhatsApp, sendSMS, getMessagingStatus } = require('./messaging');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '../index.html'));
}

app.whenReady().then(createWindow);
```

## 4) واجهات HTML المدعومة

| في المتصفح / SPA | عبر Electron |
|------------------|--------------|
| `HardwareBridge.printThermal(html)` | `cuppingElectron.devices.printThermal` |
| `HardwareBridge.printA4(html)` | `cuppingElectron.devices.printA4` |
| `HardwareBridge.openCashDrawer()` | `cuppingElectron.devices.openCashDrawer` |
| `BackupBridge.saveLocal(...)` | `cuppingElectron.backup.saveLocal` |
| `MessagingBridge.send(...)` | `cuppingElectron.messaging.sendWhatsApp/SMS` |
| `MessagingBridge` + Integrations UI | `cuppingElectron.communication.*` |

## 5) Communication Gateway

طبقة تكامل موحّدة للرسائل (SMS / WhatsApp / OTP) عبر مزودين سعوديين بدون تعديل الكود عند إضافة مزود جديد.

### المزودون المدمجون

4jawaly · Taqnyat · urWhats · iMissive · Deewan · Unifonic · Qalaama · Zajel · Custom REST · Manual (wa.me)

### واجهة الإعدادات

**الإعدادات → 🔗 التكاملات** — إضافة مزود، اختبار اتصال، اختيار المزود النشط، قوالب الرسائل، Webhook، وطابور الإرسال.

### IPC (preload)

```javascript
await window.cuppingElectron.communication.init({ communication: settings.communication });
await window.cuppingElectron.communication.send(config, { phone, message, channel: 'whatsapp' });
await window.cuppingElectron.communication.testProvider({ slug: 'taqnyat', apiKey: '...' });
await window.cuppingElectron.communication.processQueue(config);
const providers = await window.cuppingElectron.communication.listProviders();
```

### Webhook محلي

يستمع على `http://127.0.0.1:17890/webhook` (قابل للتغيير) ويُحدّث حالة التسليم في سجل الرسائل.

### ملفات الواجهة

- `cupping-communication-gateway.js` — إعدادات `settings.communication`، واجهة المزودين، الطابور
- `MessagingBridge` في `index.html` — يمرّر الإعدادات إلى Electron تلقائياً

### ترحيل الإعدادات القديمة

`settings.messagingApi` يُحوَّل تلقائياً إلى `settings.communication.providers` عند أول فتح لتبويب التكاملات.

## 6) اختبار سريع

```javascript
await window.cuppingElectron.devices.printThermal('<div>اختبار</div>', { paperWidth: 80, printerName: 'POS-80' });
await window.cuppingElectron.devices.getStatus();
```

**Windows:** الطباعة تستخدم Silent GDI Print (HTML مُعرَّض) — لا تُرسل أوامر TSPL/RAW للفاتورة. درج الكاشير يُرسل نبضة ESC/POS RAW للطابعة المختارة.

**اختيار الطابعة:** من الإعدادات → الطابعات → زر «اختيار» يفتح قائمة الطابعات المتصلة في Windows.

```bash
npm start
npm run build
```

ملف `cupping-production.js` يفعّل `patchElectronBridges()` تلقائياً عند التحميل لربط الاسمين.
