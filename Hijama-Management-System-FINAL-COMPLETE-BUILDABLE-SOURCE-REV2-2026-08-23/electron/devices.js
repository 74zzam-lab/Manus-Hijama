/**
 * Windows printing via Electron silent GDI print (full HTML document — same as browser printHTML).
 * Cash drawer via RAW ESC/POS kick to the selected thermal printer.
 */
const { BrowserWindow, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ESCPOS_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x08, 0x08]);

/** Short pulse — opens drawer slightly (~16ms on / ~16ms off). */
function buildDrawerKick(pulseMs = 60) {
  const units = Math.min(40, Math.max(2, Math.round((pulseMs || 60) / 4)));
  return Buffer.from([0x1B, 0x70, 0x00, units, units]);
}

async function listPrinters() {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      isDefault: !!p.isDefault,
      status: p.status || 0,
      options: p.options || {},
    }));
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function waitForImages(win) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const imgs = [...document.images];
      if (!imgs.length) return resolve(true);
      Promise.all(imgs.map((img) => img.complete
        ? true
        : new Promise((r) => { img.onload = () => r(true); img.onerror = () => r(true); })
      )).then(() => resolve(true));
    })
  `).catch(() => true);
}

function silentPrint(win, options) {
  return new Promise((resolve, reject) => {
    const printOpts = {
      silent: true,
      printBackground: true,
      deviceName: options.printerName || '',
      landscape: !!options.landscape,
      scaleFactor: 100,
    };
    if (options.thermal) {
      const pw = parseInt(options.paperWidth, 10) || 80;
      printOpts.margins = { marginType: 'none' };
      printOpts.preferCSSPageSize = true;
      printOpts.pageSize = { width: pw * 1000, height: 300000 };
    } else {
      printOpts.margins = { marginType: 'default' };
    }
    win.webContents.print(
      printOpts,
      (success, failureReason) => {
        if (success) resolve({ ok: true });
        else reject(new Error(failureReason || 'print_failed'));
      }
    );
  });
}

async function loadAndPrintHtml(fullHtml, opts = {}) {
  const printerName = (opts.printerName || '').trim();
  if (!printerName) {
    return { ok: false, error: 'no_printer', message: 'لم يتم اختيار طابعة' };
  }
  const copies = Math.min(5, Math.max(1, parseInt(opts.copies, 10) || 1));
  const tmpPath = path.join(os.tmpdir(), `cupping-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpPath, fullHtml, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 420,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  try {
    await win.loadFile(tmpPath);
    await waitForImages(win);
    await new Promise((r) => setTimeout(r, 600));
    for (let i = 0; i < copies; i++) {
      await silentPrint(win, {
        printerName: opts.printerName,
        landscape: opts.landscape,
        thermal: !!opts.thermal,
        paperWidth: opts.paperWidth,
      });
    }
    return { ok: true, printerName, copies, mode: 'electron-html' };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    if (!win.isDestroyed()) win.destroy();
  }
}

function dialogPrint(win, options) {
  return new Promise((resolve, reject) => {
    const printOpts = {
      silent: false,
      printBackground: true,
      deviceName: options.printerName || '',
      scaleFactor: 100,
    };
    if (options.thermal) {
      const pw = parseInt(options.paperWidth, 10) || 80;
      printOpts.margins = { marginType: 'none' };
      printOpts.preferCSSPageSize = true;
      printOpts.pageSize = { width: pw * 1000, height: 300000 };
    } else {
      printOpts.margins = { marginType: 'default' };
      printOpts.landscape = !!options.landscape;
      printOpts.pageSize = options.paperSize || 'A4';
    }
    win.webContents.print(printOpts, (success, failureReason) => {
      if (success) resolve({ ok: true, mode: 'electron-print-dialog' });
      else reject(new Error(failureReason || 'print_failed'));
    });
  });
}

async function printWithDialog(htmlOrDoc, opts = {}) {
  const isFull = opts.isFullDocument || String(htmlOrDoc || '').trimStart().startsWith('<!DOCTYPE');
  if (!isFull) {
    return {
      ok: false,
      error: 'invalid_document',
      message: 'يجب إرسال مستند HTML كامل للطباعة',
    };
  }
  const copies = Math.min(5, Math.max(1, parseInt(opts.copies, 10) || 1));
  const tmpPath = path.join(os.tmpdir(), `cupping-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpPath, htmlOrDoc, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: opts.thermal ? 420 : 920,
    height: opts.thermal ? 700 : 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  try {
    await win.loadFile(tmpPath);
    await waitForImages(win);
    await new Promise((r) => setTimeout(r, 450));
    for (let i = 0; i < copies; i++) {
      await dialogPrint(win, opts);
    }
    return {
      ok: true,
      printerName: opts.printerName || '',
      copies,
      mode: 'electron-print-dialog',
      thermal: !!opts.thermal,
    };
  } catch (err) {
    return { ok: false, error: 'print_failed', message: err.message || 'فشلت الطباعة' };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    if (!win.isDestroyed()) win.destroy();
  }
}

async function printThermal(htmlOrDoc, opts = {}) {
  const isFull = opts.isFullDocument || String(htmlOrDoc || '').trimStart().startsWith('<!DOCTYPE');
  if (!isFull) {
    return {
      ok: false,
      error: 'invalid_document',
      message: 'يجب إرسال مستند HTML كامل للطباعة الحرارية',
    };
  }
  return loadAndPrintHtml(htmlOrDoc, { ...opts, thermal: true, paperWidth: opts.paperWidth });
}

async function printA4(htmlOrDoc, opts = {}) {
  const isFull = opts.isFullDocument || String(htmlOrDoc || '').trimStart().startsWith('<!DOCTYPE');
  if (!isFull) {
    return {
      ok: false,
      error: 'invalid_document',
      message: 'يجب إرسال مستند HTML كامل لطباعة A4',
    };
  }
  return loadAndPrintHtml(htmlOrDoc, { ...opts, copies: 1, landscape: opts.orientation === 'landscape' });
}

function writeRawWindows(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const tmpBin = path.join(os.tmpdir(), `cupping-raw-${Date.now()}.bin`);
    const tmpPs1 = path.join(os.tmpdir(), `cupping-raw-${Date.now()}.ps1`);
    fs.writeFileSync(tmpBin, buffer);
    const script = `
$ErrorActionPreference = 'Stop'
$printer = ${JSON.stringify(printerName)}
$file = ${JSON.stringify(tmpBin)}
Add-Type @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool SendBytes(string printer, byte[] bytes) {
    IntPtr h = IntPtr.Zero;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    try {
      var di = new DOCINFO { pDocName = "CuppingDrawer", pDataType = "RAW" };
      if (!StartDocPrinter(h, 1, di)) return false;
      StartPagePrinter(h);
      IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, p, bytes.Length);
      int written;
      bool ok = WritePrinter(h, p, bytes.Length, out written);
      Marshal.FreeCoTaskMem(p);
      EndPagePrinter(h);
      EndDocPrinter(h);
      return ok;
    } finally { ClosePrinter(h); }
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($file)
if (-not [RawPrinterHelper]::SendBytes($printer, $bytes)) { throw "WritePrinter failed for $printer" }
Write-Output "OK"
`;
    fs.writeFileSync(tmpPs1, script, 'utf8');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs1],
      { windowsHide: true },
      (err, stdout) => {
        try { fs.unlinkSync(tmpBin); fs.unlinkSync(tmpPs1); } catch { /* ignore */ }
        if (err) reject(err);
        else resolve({ ok: true, stdout: (stdout || '').trim() });
      }
    );
  });
}

async function writeRaw(printerName, bufferData) {
  const name = (printerName || '').trim();
  if (!name) return { ok: false, error: 'no_printer' };
  let buffer;
  if (Buffer.isBuffer(bufferData)) buffer = bufferData;
  else if (bufferData instanceof Uint8Array) buffer = Buffer.from(bufferData);
  else if (bufferData && bufferData.type === 'Buffer' && Array.isArray(bufferData.data)) {
    buffer = Buffer.from(bufferData.data);
  } else if (Array.isArray(bufferData)) buffer = Buffer.from(bufferData);
  else return { ok: false, error: 'invalid_buffer' };

  if (process.platform === 'win32') {
    await writeRawWindows(name, buffer);
    return { ok: true, printerName: name, length: buffer.length, mode: 'raw-win32' };
  }
  return { ok: false, error: 'unsupported_platform', message: 'RAW printing supported on Windows only' };
}

async function openCashDrawer(opts = {}) {
  const printerName = (opts.printerName || '').trim();
  if (!printerName) {
    return { ok: false, error: 'no_printer', message: 'اختر الطابعة الحرارية أولاً' };
  }
  const kick = buildDrawerKick(opts.pulseMs || 60);
  return writeRaw(printerName, kick);
}

async function openCashDrawerDirect(opts = {}) {
  if (opts.comPort) {
    return { ok: false, error: 'com_not_implemented', message: 'COM direct drawer requires device driver setup' };
  }
  return openCashDrawer(opts);
}

async function getDeviceStatus(saved = {}) {
  const printers = await listPrinters();
  const names = new Set(printers.map((p) => p.name));
  const thermal = (saved.thermalName || '').trim();
  const report = (saved.reportName || '').trim();
  const listed = (n) => !!(n && names.has(n));
  return {
    thermal: { connected: listed(thermal), name: thermal || 'غير محدد' },
    drawer: { connected: listed(thermal), linkedPrinter: thermal || 'غير محدد' },
    report: { connected: listed(report), name: report || 'غير محدد' },
    backup: { connected: true, name: 'مفعّل' },
    printersAvailable: printers.length,
  };
}

async function exportA4Pdf(htmlOrDoc, opts = {}) {
  const isFull = opts.isFullDocument || String(htmlOrDoc || '').trimStart().startsWith('<!DOCTYPE');
  if (!isFull) {
    return { ok: false, error: 'invalid_document', message: 'يجب إرسال مستند HTML كامل للتصدير PDF' };
  }
  const defaultName = (opts.documentTitle || 'Monthly_Archive') + '.pdf';
  const save = await dialog.showSaveDialog({
    title: 'حفظ أرشيف التقارير PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (save.canceled || !save.filePath) return { ok: false, error: 'cancelled' };

  const tmpPath = path.join(os.tmpdir(), `cupping-pdf-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, htmlOrDoc, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: 920,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false },
  });
  try {
    await win.loadFile(tmpPath);
    await waitForImages(win);
    await new Promise((r) => setTimeout(r, 450));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      landscape: opts.orientation === 'landscape',
      pageSize: opts.paperSize || 'A4',
    });
    fs.writeFileSync(save.filePath, pdf);
    return { ok: true, path: save.filePath, mode: 'electron-pdf' };
  } catch (err) {
    return { ok: false, error: 'pdf_failed', message: err.message || 'فشل تصدير PDF' };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = {
  listPrinters,
  openCashDrawer,
  openCashDrawerDirect,
  printThermal,
  printA4,
  printWithDialog,
  exportA4Pdf,
  getDeviceStatus,
  writeRaw,
  ESCPOS_DRAWER_KICK,
  buildDrawerKick,
};
