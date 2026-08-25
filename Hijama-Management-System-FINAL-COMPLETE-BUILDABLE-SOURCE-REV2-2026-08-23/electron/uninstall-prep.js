/**
 * Uninstall preparation — V2-3.5 policy:
 * - App-only (default / fullRemoval:false): NO-OP preserve of ALL userData including license.
 * - Full wipe (fullRemoval:true): permanently delete Cupping Center userData roots.
 * Invoked by NSIS: Hijama Management System.exe --uninstall-prep [--uninstall-full]
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const USER_DATA_FOLDER = 'Cupping Center';

const META_FILE = 'uninstall-center-meta.json';
const DEFAULT_CENTER = 'Cupping-Center';

function sanitizeFolderName(name) {
  return String(name || DEFAULT_CENTER)
    .replace(/[<>:"|?*\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || DEFAULT_CENTER;
}

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function writeUninstallCenterMeta(userDataRoot, payload = {}) {
  const root = userDataRoot || '';
  if (!root) return null;
  const file = path.join(root, META_FILE);
  const prev = readUninstallCenterMeta(root);
  const doc = {
    centerName: payload.centerName || prev.centerName || DEFAULT_CENTER,
    centerId: payload.centerId || prev.centerId || '',
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    return doc;
  } catch {
    return null;
  }
}

function readUninstallCenterMeta(userDataRoot) {
  const file = path.join(userDataRoot || '', META_FILE);
  try {
    if (fs.existsSync(file)) {
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (doc && doc.centerName) return doc;
    }
  } catch { /* ignore */ }

  const cacheRoot = path.join(userDataRoot || '', 'cache');
  if (fs.existsSync(cacheRoot)) {
    try {
      const dirs = fs.readdirSync(cacheRoot).filter((n) => {
        try { return fs.statSync(path.join(cacheRoot, n)).isDirectory(); } catch { return false; }
      });
      if (dirs.length) return { centerName: DEFAULT_CENTER, centerId: dirs[0], updatedAt: '' };
    } catch { /* ignore */ }
  }
  return { centerName: DEFAULT_CENTER, centerId: '', updatedAt: '' };
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rmDirSafe(dir) {
  if (!dir || !fs.existsSync(dir)) return true;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    } catch { /* retry */ }
    if (!fs.existsSync(dir)) return true;
    sleepSync(400 * (attempt + 1));
  }
  return !fs.existsSync(dir);
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* wait */ }
}

const LEGACY_USER_DATA_NAMES = [
  USER_DATA_FOLDER,
  'Hijama Management System',
  'com.tadawi.cuppingcenter',
  'hijama-management-system',
  'NajjarTech',
];

/** Chromium / Electron dirs that hold localStorage license keys — used ONLY on full wipe */
const CHROMIUM_STORAGE_DIRS = [
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Service Worker',
  'Cache',
  'Code Cache',
  'GPUCache',
  'blob_storage',
  'databases',
  'WebStorage',
  'Cookies',
  'Network',
  'Shared Dictionary',
];

const LICENSE_FILE_NAMES = [
  '.license-wipe-on-launch',
  'cloud-oauth.config.json',
  'cloud-oauth.developer.json',
  'Preferences',
  'Local State',
];

function resolveLegacyUserDataRoots() {
  const roots = new Set();
  const add = (p) => { if (p) roots.add(path.normalize(p)); };
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    LEGACY_USER_DATA_NAMES.forEach((name) => {
      if (appData) add(path.join(appData, name));
      if (localAppData) add(path.join(localAppData, name));
    });
  }
  return [...roots];
}

function removeLicenseCacheFiles(root) {
  const cacheRoot = path.join(root, 'cache');
  if (!fs.existsSync(cacheRoot)) return;
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === 'license.json' || /\.lic$/i.test(ent.name)) {
        try { fs.unlinkSync(full); } catch { /* ignore */ }
      }
    }
  };
  walk(cacheRoot);
}

function wipeChromiumLicenseStorage(root) {
  if (!root || !fs.existsSync(root)) return false;
  let allGone = true;
  for (const sub of CHROMIUM_STORAGE_DIRS) {
    const p = path.join(root, sub);
    if (!fs.existsSync(p)) continue;
    if (!rmDirSafe(p)) allGone = false;
  }
  for (const f of LICENSE_FILE_NAMES) {
    try {
      const p = path.join(root, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch { /* ignore */ }
  }
  const vault = path.join(root, 'CloudVault');
  if (fs.existsSync(vault) && !rmDirSafe(vault)) allGone = false;
  return allGone;
}

function stripLicenseFilesystem(root) {
  if (!root || !fs.existsSync(root)) return;
  removeLicenseCacheFiles(root);
  wipeChromiumLicenseStorage(root);
}

function spawnWipeChild(execPath, userDataPath) {
  return new Promise((resolve) => {
    const args = ['--uninstall-wipe-only', userDataPath];
    const child = spawn(execPath, args, {
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_NO_ATTACH_CONSOLE: '1' },
    });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
    setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve(1);
    }, 90_000);
  });
}

async function wipeLicenseStorageAtPath(execPath, userDataPath) {
  stripLicenseFilesystem(userDataPath);
  const ls = path.join(userDataPath, 'Local Storage');
  if (fs.existsSync(ls) && execPath && fs.existsSync(execPath)) {
    await spawnWipeChild(execPath, userDataPath);
    wipeChromiumLicenseStorage(userDataPath);
  }
  return fs.existsSync(ls) ? 1 : 0;
}

function buildArchivePath(appDataDir, centerName) {
  return path.join(appDataDir, `${sanitizeFolderName(centerName)}-${formatTimestamp()}`);
}

/**
 * @param {object} opts
 * @param {string} opts.userDataRoot
 * @param {string} opts.execPath
 * @param {boolean} opts.fullRemoval - ONLY true for explicit full wipe
 */
async function runUninstallPrep(opts) {
  const userDataRoot = path.normalize(opts.userDataRoot || '');
  const execPath = opts.execPath || process.execPath;
  const fullRemoval = !!opts.fullRemoval;
  // Production full wipe scans all known legacy roots by default. Isolated tests must
  // opt out explicitly so a fixture never inspects or deletes the host AppData tree.
  const scanLegacyRoots = opts.scanLegacyRoots !== false;

  const primaryRoot = userDataRoot || (scanLegacyRoots ? resolveLegacyUserDataRoots().find((p) => fs.existsSync(p)) : '') || '';

  // V2-3.5: App-only uninstall preserves EVERYTHING including license — no wipe.
  if (!fullRemoval) {
    const meta = primaryRoot && fs.existsSync(primaryRoot)
      ? readUninstallCenterMeta(primaryRoot)
      : { centerName: DEFAULT_CENTER };
    return {
      ok: true,
      archivePath: '',
      centerName: meta.centerName,
      preservedRoot: primaryRoot || '',
      preserved: true,
      licensePreserved: true,
      skippedWipe: true,
    };
  }

  if (!primaryRoot || !fs.existsSync(primaryRoot)) {
    const wiped = await wipeAllLegacyUserDataRoots(execPath, '', scanLegacyRoots);
    return { ok: wiped, archivePath: '', skipped: true, wipedLegacy: wiped, fullRemoval: true };
  }

  const meta = readUninstallCenterMeta(primaryRoot);
  try {
    const wiped = await wipeAllLegacyUserDataRoots(execPath, primaryRoot, scanLegacyRoots);
    const remaining = findRemainingLicenseRoots(primaryRoot, scanLegacyRoots);
    if (remaining.length) {
      return {
        ok: false,
        error: 'user_data_still_present',
        archivePath: '',
        centerName: meta.centerName,
        remaining,
        fullRemoval: true,
      };
    }
    return { ok: wiped, archivePath: '', centerName: meta.centerName, fullRemoval: true };
  } catch (err) {
    return { ok: false, error: err.message, archivePath: '', fullRemoval: true };
  }
}

async function wipeLicenseFromLegacyUserDataRoots(execPath, preferredRoot, scanLegacyRoots = true) {
  // Retained for explicit authorized reset tooling — NOT used by default uninstall.
  const roots = scanLegacyRoots ? resolveLegacyUserDataRoots() : [];
  if (preferredRoot) roots.unshift(path.normalize(preferredRoot));
  const seen = new Set();
  let allOk = true;
  for (const root of roots) {
    const norm = path.normalize(root);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (!fs.existsSync(norm)) continue;
    const code = await wipeLicenseStorageAtPath(execPath, norm);
    if (code !== 0) allOk = false;
  }
  return allOk;
}

function findRemainingLicenseRoots(preferredRoot = '', scanLegacyRoots = true) {
  const roots = [];
  if (preferredRoot) roots.push(path.normalize(preferredRoot));
  if (scanLegacyRoots) roots.push(...resolveLegacyUserDataRoots());
  return [...new Set(roots)].filter((root) => {
    if (!fs.existsSync(root)) return false;
    const markers = [
      path.join(root, 'Local Storage'),
      path.join(root, 'uninstall-center-meta.json'),
      path.join(root, 'cache'),
    ];
    return markers.some((p) => fs.existsSync(p));
  });
}

async function wipeAllLegacyUserDataRoots(execPath, preferredRoot, scanLegacyRoots = true) {
  const roots = [];
  if (preferredRoot) roots.push(path.normalize(preferredRoot));
  if (scanLegacyRoots) {
    for (const r of resolveLegacyUserDataRoots()) roots.push(r);
  }
  const seen = new Set();
  let allOk = true;
  for (const root of roots) {
    const norm = path.normalize(root);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (!fs.existsSync(norm)) continue;
    stripLicenseFilesystem(norm);
    if (fs.existsSync(path.join(norm, 'Local Storage'))) {
      await wipeLicenseStorageAtPath(execPath, norm);
    }
    if (!rmDirSafe(norm)) allOk = false;
  }
  return allOk;
}

module.exports = {
  META_FILE,
  USER_DATA_FOLDER,
  DEFAULT_CENTER,
  CHROMIUM_STORAGE_DIRS,
  LEGACY_USER_DATA_NAMES,
  sanitizeFolderName,
  formatTimestamp,
  writeUninstallCenterMeta,
  readUninstallCenterMeta,
  stripLicenseFilesystem,
  wipeChromiumLicenseStorage,
  wipeLicenseStorageAtPath,
  wipeLicenseFromLegacyUserDataRoots,
  runUninstallPrep,
  buildArchivePath,
  resolveLegacyUserDataRoots,
  findRemainingLicenseRoots,
  wipeAllLegacyUserDataRoots,
  copyDirSync,
};
