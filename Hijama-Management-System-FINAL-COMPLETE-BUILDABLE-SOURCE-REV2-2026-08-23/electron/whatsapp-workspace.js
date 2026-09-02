'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserView, shell } = require('electron');

const WA_ORIGIN = 'https://web.whatsapp.com';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const WA_HOST_RE = /(^|\.)whatsapp\.(com|net)$/i;

let view = null;
let attachedWin = null;

function isWhatsAppUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return WA_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

function contactsDir() {
  const dir = path.join(app.getPath('userData'), 'whatsapp-contacts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function documentsDir() {
  try {
    const dir = path.join(app.getPath('documents'), 'Tadawi-WhatsApp-Contacts');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return contactsDir();
  }
}

function ensureView(mainWindow) {
  if (view && !view.webContents.isDestroyed()) return view;
  view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:tdw-whatsapp',
    },
  });
  try { view.webContents.setUserAgent(CHROME_UA); } catch { /* older electron */ }
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isWhatsAppUrl(url)) {
      view.webContents.loadURL(url).catch(() => {});
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  view.webContents.on('will-navigate', (event, url) => {
    if (isWhatsAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
  });
  view.webContents.loadURL(WA_ORIGIN).catch(() => {});
  attachedWin = mainWindow;
  return view;
}

function attachView(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no_window' };
  const v = ensureView(mainWindow);
  attachedWin = mainWindow;
  try {
    if (typeof mainWindow.addBrowserView === 'function') {
      const current = typeof mainWindow.getBrowserViews === 'function' ? mainWindow.getBrowserViews() : [];
      if (!current.includes(v)) mainWindow.addBrowserView(v);
    } else if (typeof mainWindow.setBrowserView === 'function') {
      mainWindow.setBrowserView(v);
    }
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  return { ok: true };
}

function detachView(mainWindow) {
  const win = mainWindow || attachedWin;
  if (!win || win.isDestroyed() || !view) return { ok: true, hidden: true };
  try {
    if (typeof win.removeBrowserView === 'function') win.removeBrowserView(view);
    else if (typeof win.setBrowserView === 'function') win.setBrowserView(null);
  } catch { /* already detached */ }
  return { ok: true, hidden: true };
}

function setBounds(mainWindow, bounds) {
  const win = mainWindow || attachedWin;
  if (!view || !win || win.isDestroyed()) return { ok: false, reason: 'no_view' };
  const attached = attachView(win);
  if (!attached.ok) return attached;
  const x0 = Math.max(0, Math.round(Number(bounds?.x) || 0));
  const y0 = Math.max(0, Math.round(Number(bounds?.y) || 0));
  let x = x0;
  let y = y0;
  try {
    const content = typeof win.getContentBounds === 'function' ? win.getContentBounds() : null;
    const winBounds = typeof win.getBounds === 'function' ? win.getBounds() : null;
    if (content && winBounds) {
      x += Math.max(0, Math.round(content.x - winBounds.x));
      y += Math.max(0, Math.round(content.y - winBounds.y));
    }
  } catch { /* renderer coordinates already match on frameless windows */ }
  const width = Math.max(320, Math.round(Number(bounds?.width) || 480));
  const height = Math.max(360, Math.round(Number(bounds?.height) || 560));
  try { view.setBounds({ x, y, width, height }); } catch (e) {
    return { ok: false, reason: e.message };
  }
  return { ok: true, bounds: { x, y, width, height } };
}

async function openChat(phone, text) {
  if (!view || view.webContents.isDestroyed()) return { ok: false, reason: 'no_view' };
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'invalid_phone' };
  const url = `${WA_ORIGIN}/send?phone=${digits}&text=${encodeURIComponent(text || '')}`;
  await view.webContents.loadURL(url);
  return { ok: true, mode: 'embedded', phone: digits };
}

function withBom(text) {
  const s = String(text || '');
  if (!s) return s;
  return s.charCodeAt(0) === 0xFEFF ? s : `\uFEFF${s}`;
}

function writeNamed(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function writeContacts({ csv, vcf, googleCsv }) {
  const userDir = contactsDir();
  const docs = documentsDir();
  const written = [];
  function writeBoth(name, body, bom) {
    if (!body) return;
    const payload = bom ? withBom(body) : body;
    written.push(writeNamed(userDir, name, payload));
    try { written.push(writeNamed(docs, name, payload)); } catch { /* documents may be locked */ }
  }
  writeBoth('clients-whatsapp.csv', csv, true);
  writeBoth('clients-google-contacts.csv', googleCsv, true);
  writeBoth('clients-whatsapp.vcf', vcf, false);
  return {
    ok: true,
    dir: docs,
    userDir,
    written: Array.from(new Set(written)),
    at: new Date().toISOString(),
  };
}

async function openContactsFolder() {
  const dir = documentsDir();
  await shell.openPath(dir);
  return { ok: true, dir };
}

async function openVcard() {
  const file = path.join(documentsDir(), 'clients-whatsapp.vcf');
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing_vcf' };
  const err = await shell.openPath(file);
  return { ok: !err, dir: path.dirname(file), error: err || undefined };
}

module.exports = {
  attachView,
  detachView,
  setBounds,
  openChat,
  writeContacts,
  openContactsFolder,
  openVcard,
  isWhatsAppUrl,
};
