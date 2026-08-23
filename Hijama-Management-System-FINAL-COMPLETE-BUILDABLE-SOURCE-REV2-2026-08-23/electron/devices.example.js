/**
 * مثال لمعالجة الطابعات ودرج الكاشير في Electron main process.
 * انسخه إلى electron/devices.js واربطه بمكتبة الطابعة الفعلية.
 */
const ESCPOS_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

function buildDrawerKick(pulseMs = 200) {
  const t2 = Math.min(255, Math.max(1, Math.round(pulseMs / 2)));
  return Buffer.from([0x1B, 0x70, 0x00, t2, t2]);
}

async function listPrinters() {
  // Windows: استخدم pdf-to-printer أو win32-print أو escpos
  return [];
}

async function openCashDrawer(opts = {}) {
  const kick = buildDrawerKick(opts.pulseMs || 200);
  const printerName = opts.printerName || '';
  // TODO: أرسل kick للطابعة الحرارية عبر USB/Network/Windows spooler
  // await writeRaw(printerName, kick);
  if (opts.connectionMode === 'computer' && opts.comPort) {
    // TODO: فتح الدرج عبر منفذ COM/USB مباشرة
    return { ok: true, mode: 'computer', comPort: opts.comPort, bytes: kick.length };
  }
  return { ok: true, printerName, bytes: kick.length };
}

async function printThermal(html, opts = {}) {
  // TODO: حوّل HTML إلى ESC/POS أو استخدم silent print على طابعة محددة
  return { ok: true, printerName: opts.printerName, copies: opts.copies || 1 };
}

async function printA4(html, opts = {}) {
  // TODO: silent print على طابعة A4
  return { ok: true, printerName: opts.printerName };
}

async function getDeviceStatus() {
  return {
    thermal: { connected: true, name: 'POS-80 Thermal Printer' },
    drawer: { connected: true, linkedPrinter: 'POS-80 Thermal Printer' },
    report: { connected: true, name: 'Microsoft Print to PDF' },
    backup: { connected: true, name: 'مفعّل' },
  };
}

async function writeRaw(printerName, buffer) {
  // TODO: إرسال Buffer خام للطابعة
  return { ok: true, printerName, length: buffer?.length || 0 };
}

module.exports = {
  listPrinters,
  openCashDrawer,
  printThermal,
  printA4,
  getDeviceStatus,
  writeRaw,
  ESCPOS_DRAWER_KICK,
  buildDrawerKick,
};
