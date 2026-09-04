'use strict';

const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { app, shell, BrowserWindow } = electron;
const { normalizeWhatsAppEmbedBounds } = require('../cloud/whatsapp-embed-bounds');

const WA_ORIGIN = 'https://web.whatsapp.com';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const WA_HOST_RE = /(^|\.)whatsapp\.(com|net)$/i;
const WA_BG = '#0b141a';

let view = null;
let attachedWin = null;
let viewKind = 'none';
let sendWin = null;

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

function webContentsOf(v) {
  return v && v.webContents ? v.webContents : null;
}

function applyChromeUa(wc) {
  if (!wc) return;
  try { wc.setUserAgent(CHROME_UA); } catch { /* older electron */ }
}

function wireNavigation(wc) {
  if (!wc) return;
  wc.setWindowOpenHandler(({ url }) => {
    if (isWhatsAppUrl(url)) {
      wc.loadURL(url).catch(() => {});
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (isWhatsAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
  });
}

function paintBackground(v) {
  try {
    if (v && typeof v.setBackgroundColor === 'function') v.setBackgroundColor(WA_BG);
  } catch { /* optional */ }
}

function disableAutoResize(v) {
  try {
    if (v && typeof v.setAutoResize === 'function') {
      v.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });
    }
  } catch { /* WebContentsView has no auto-resize */ }
}

function ensureView(mainWindow) {
  const wc = webContentsOf(view);
  if (view && wc && !wc.isDestroyed()) return view;

  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    partition: 'persist:tdw-whatsapp',
  };

  if (typeof electron.WebContentsView === 'function') {
    view = new electron.WebContentsView({ webPreferences });
    viewKind = 'webcontents';
  } else {
    view = new electron.BrowserView({ webPreferences });
    viewKind = 'browserview';
  }

  const created = webContentsOf(view);
  applyChromeUa(created);
  wireNavigation(created);
  paintBackground(view);
  disableAutoResize(view);
  attachedWin = mainWindow;
  if (created) {
    created.loadURL(WA_ORIGIN).catch(() => {});
  }
  return view;
}

function contentViewOf(win) {
  try {
    return win && typeof win.contentView !== 'undefined' ? win.contentView : null;
  } catch {
    return null;
  }
}

function childViewsOf(parent) {
  if (!parent) return [];
  if (Array.isArray(parent.children)) return parent.children;
  try {
    if (typeof parent.getBrowserViews === 'function') return parent.getBrowserViews() || [];
  } catch { /* ignore */ }
  return [];
}

function attachView(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no_window' };
  const v = ensureView(mainWindow);
  attachedWin = mainWindow;
  try {
    if (viewKind === 'webcontents') {
      const parent = contentViewOf(mainWindow);
      if (parent && typeof parent.addChildView === 'function') {
        if (!childViewsOf(parent).includes(v)) parent.addChildView(v);
      } else if (typeof mainWindow.addBrowserView === 'function') {
        const current = typeof mainWindow.getBrowserViews === 'function' ? mainWindow.getBrowserViews() : [];
        if (!current.includes(v)) mainWindow.addBrowserView(v);
      }
    } else if (typeof mainWindow.addBrowserView === 'function') {
      const current = typeof mainWindow.getBrowserViews === 'function' ? mainWindow.getBrowserViews() : [];
      if (!current.includes(v)) mainWindow.addBrowserView(v);
    } else if (typeof mainWindow.setBrowserView === 'function') {
      mainWindow.setBrowserView(v);
    }
    if (typeof v.setVisible === 'function') v.setVisible(true);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  return { ok: true, kind: viewKind };
}

function detachView(mainWindow) {
  const win = mainWindow || attachedWin;
  if (!view) return { ok: true, hidden: true };
  try {
    if (typeof view.setVisible === 'function') {
      view.setVisible(false);
      return { ok: true, hidden: true };
    }
  } catch { /* fall through to remove */ }
  if (!win || win.isDestroyed()) return { ok: true, hidden: true };
  try {
    const parent = contentViewOf(win);
    if (viewKind === 'webcontents' && parent && typeof parent.removeChildView === 'function') {
      parent.removeChildView(view);
    } else if (typeof win.removeBrowserView === 'function') {
      win.removeBrowserView(view);
    } else if (typeof win.setBrowserView === 'function') {
      win.setBrowserView(null);
    }
  } catch { /* already detached */ }
  return { ok: true, hidden: true };
}

function contentSizeOf(win) {
  try {
    if (typeof win.getContentSize === 'function') {
      const size = win.getContentSize();
      return { width: Math.round(Number(size && size[0]) || 0), height: Math.round(Number(size && size[1]) || 0) };
    }
  } catch { /* ignore */ }
  return { width: 0, height: 0 };
}

function setBounds(mainWindow, bounds) {
  const win = mainWindow || attachedWin;
  if (!view || !win || win.isDestroyed()) return { ok: false, reason: 'no_view' };
  const attached = attachView(win);
  if (!attached.ok) return attached;

  const content = contentSizeOf(win);
  const normalized = normalizeWhatsAppEmbedBounds({
    x: bounds && bounds.x,
    y: bounds && bounds.y,
    width: bounds && bounds.width,
    height: bounds && bounds.height,
    rtl: bounds && bounds.rtl,
    viewportWidth: (bounds && bounds.viewportWidth) || content.width,
    viewportHeight: (bounds && bounds.viewportHeight) || content.height,
    zoom: bounds && bounds.zoom,
  });

  if (content.width > 0) {
    normalized.width = Math.min(normalized.width, Math.max(1, content.width - normalized.x));
  }
  if (content.height > 0) {
    normalized.height = Math.min(normalized.height, Math.max(1, content.height - normalized.y));
  }

  paintBackground(view);
  disableAutoResize(view);
  try { view.setBounds(normalized); } catch (e) {
    return { ok: false, reason: e.message };
  }
  return { ok: true, bounds: normalized, kind: viewKind };
}

function viewLooksVisible() {
  try {
    if (!view || typeof view.getBounds !== 'function') return false;
    const b = view.getBounds();
    return !!(b && b.width >= 200 && b.height >= 200);
  } catch {
    return false;
  }
}

async function openSendSlot(urlString) {
  if (!isWhatsAppUrl(urlString)) return { ok: false, reason: 'invalid_url' };
  const wc = webContentsOf(view);
  if (wc && !wc.isDestroyed() && viewLooksVisible()) {
    await wc.loadURL(urlString);
    return { ok: true, mode: 'embed-reuse', reused: true };
  }
  if (sendWin && !sendWin.isDestroyed()) {
    await sendWin.loadURL(urlString);
    try {
      if (typeof sendWin.isMinimized === 'function' && sendWin.isMinimized()) sendWin.restore();
      sendWin.show();
      sendWin.focus();
    } catch { /* focus is best-effort */ }
    return { ok: true, mode: 'window-reuse', reused: true };
  }
  sendWin = new BrowserWindow({
    width: 1100,
    height: 800,
    title: 'واتساب — إرسال',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:tdw-whatsapp',
    },
  });
  const swc = sendWin.webContents;
  applyChromeUa(swc);
  swc.setWindowOpenHandler(({ url }) => {
    if (isWhatsAppUrl(url)) {
      sendWin.loadURL(url).catch(() => {});
    } else if (/^https?:/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  swc.on('will-navigate', (event, url) => {
    if (isWhatsAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
  });
  sendWin.on('closed', () => { sendWin = null; });
  await sendWin.loadURL(urlString);
  return { ok: true, mode: 'window-new', reused: false };
}

async function openChat(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'invalid_phone' };
  const url = `${WA_ORIGIN}/send?phone=${digits}&text=${encodeURIComponent(text || '')}`;
  const opened = await openSendSlot(url);
  return { ...opened, phone: digits, mode: opened.mode || 'embedded' };
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
  openSendSlot,
  writeContacts,
  openContactsFolder,
  openVcard,
  isWhatsAppUrl,
};
