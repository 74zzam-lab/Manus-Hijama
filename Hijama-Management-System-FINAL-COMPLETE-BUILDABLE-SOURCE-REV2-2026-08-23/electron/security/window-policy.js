'use strict';

/**
 * Window navigation, permissions, CSP, and child-window policy (Phase 2).
 */
const path = require('path');
const { shell } = require('electron');

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'sms:']);
const DENIED_PERMISSIONS = new Set([
  'media',
  'mediaKeySystem',
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'pointerLock',
  'openExternal',
  'clipboard-read',
  'display-capture',
  'serial',
  'usb',
  'hid',
  'idleDetection',
  'camera',
  'microphone',
]);

/** CSP: keep unsafe-inline for current monolithic UI; block remote scripts/objects. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Google OAuth/Drive + Apps Script license vault + best-effort time checks
  "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://www.google.com https://googleapis.com https://script.google.com https://script.googleusercontent.com https://timeapi.io https://worldtimeapi.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
].join('; ');

function isAllowedExternalUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(u.protocol)) return false;
    // Block file / UNC disguised as weird protocols already handled
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      // no credentials in URL
      if (u.username || u.password) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function openExternalSafe(urlString) {
  if (!isAllowedExternalUrl(urlString)) {
    return { ok: false, error: 'external_url_denied' };
  }
  await shell.openExternal(urlString);
  return { ok: true };
}

function isAppLocalUrl(urlString, appRoot) {
  try {
    const u = new URL(urlString);
    if (u.protocol === 'file:') {
      const filePath = decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
      const resolved = path.resolve(filePath);
      const root = path.resolve(appRoot);
      const rel = path.relative(root, resolved);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    }
    // Electron may use custom app protocol in future — deny for now
    return false;
  } catch {
    return false;
  }
}

function isBlankUrl(urlString) {
  return !urlString || urlString === 'about:blank' || urlString.startsWith('about:blank#');
}

/**
 * Classify window.open / setWindowOpenHandler requests.
 * @returns {'external'|'print'|'app-local'|'deny'}
 */
function classifyWindowOpen(urlString, appRoot) {
  if (isBlankUrl(urlString)) return 'print';
  if (isAllowedExternalUrl(urlString)) return 'external';
  if (isAppLocalUrl(urlString, appRoot)) return 'app-local';
  return 'deny';
}

function applyPermissionPolicy(session) {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = !DENIED_PERMISSIONS.has(permission);
    callback(allowed);
  });
  session.setPermissionCheckHandler((_wc, permission) => !DENIED_PERMISSIONS.has(permission));
}

function applyContentSecurityPolicy(session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders || {}) };
    // Avoid duplicating if already present
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-security-policy');
    if (!key) {
      headers['Content-Security-Policy'] = [CSP];
    }
    callback({ responseHeaders: headers });
  });
}

function attachNavigationGuards(webContents, { appRoot, isMain = false } = {}) {
  webContents.on('will-navigate', (event, url) => {
    if (isBlankUrl(url)) return;
    if (isAppLocalUrl(url, appRoot)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      openExternalSafe(url).catch(() => {});
    }
  });

  webContents.on('will-redirect', (event, url) => {
    if (isAppLocalUrl(url, appRoot) || isBlankUrl(url)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      openExternalSafe(url).catch(() => {});
    }
  });

  // Main window should not become an arbitrary remote page
  if (isMain) {
    webContents.on('will-frame-navigate', (event) => {
      const url = event.url;
      if (isAppLocalUrl(url, appRoot) || isBlankUrl(url)) return;
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        openExternalSafe(url).catch(() => {});
      }
    });
  }
}

function secureWebPreferences({ preloadPath = null, isProd = false, sandbox = true } = {}) {
  const prefs = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: sandbox !== false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    devTools: !isProd,
  };
  if (preloadPath) prefs.preload = preloadPath;
  return prefs;
}

module.exports = {
  CSP,
  ALLOWED_EXTERNAL_PROTOCOLS,
  DENIED_PERMISSIONS,
  isAllowedExternalUrl,
  openExternalSafe,
  isAppLocalUrl,
  isBlankUrl,
  classifyWindowOpen,
  applyPermissionPolicy,
  applyContentSecurityPolicy,
  attachNavigationGuards,
  secureWebPreferences,
};
