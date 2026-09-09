/**
 * Clinic data snapshot — copies Electron LevelDB (localStorage) as clinic.db binary tree.
 * The app stores data in Chromium LevelDB under userData — not a separate SQLite file yet.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const fflate = require('fflate');

const SKIP_LEVELDB_FILES = new Set(['lock', 'current']);
const SKIP_LEVELDB_SUFFIXES = ['.log'];

function getDataPaths() {
  const userData = app.getPath('userData');
  return {
    userData,
    levelDb: path.join(userData, 'Local Storage', 'leveldb'),
    indexedDb: path.join(userData, 'IndexedDB')
  };
}

function shouldSkipLevelDbFile(name) {
  const lower = String(name || '').toLowerCase();
  if (SKIP_LEVELDB_FILES.has(lower)) return true;
  return SKIP_LEVELDB_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait */ }
}

function copyFileWithRetry(src, dest, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      return true;
    } catch (err) {
      const retryable = err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES');
      if (retryable && attempt < retries - 1) {
        sleepSync(40 * (attempt + 1));
        continue;
      }
      if (shouldSkipLevelDbFile(path.basename(src))) return false;
      throw err;
    }
  }
  return false;
}

function copyDirSafe(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (shouldSkipLevelDbFile(name)) continue;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyDirSafe(src, dest);
    else copyFileWithRetry(src, dest);
  }
}

function readFileWithRetry(full, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return fs.readFileSync(full);
    } catch (err) {
      const retryable = err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES');
      if (retryable && attempt < retries - 1) {
        sleepSync(40 * (attempt + 1));
        continue;
      }
      if (shouldSkipLevelDbFile(path.basename(full))) return null;
      throw err;
    }
  }
  return null;
}

function collectDirIntoZip(dir, zipPrefix, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (shouldSkipLevelDbFile(name)) continue;
    const full = path.join(dir, name);
    const rel = `${zipPrefix}/${name}`.replace(/\\/g, '/');
    const st = fs.statSync(full);
    if (st.isDirectory()) collectDirIntoZip(full, `${zipPrefix}/${name}`, out);
    else {
      const data = readFileWithRetry(full);
      if (data && data.length) out[rel] = new Uint8Array(data);
    }
  }
}

function buildManifest(meta) {
  return JSON.stringify({
    format: 'clinic-db-snapshot-v1',
    appVersion: meta.appVersion || '0',
    dbSchemaVersion: meta.dbSchemaVersion || 0,
    buildVersion: meta.buildVersion || meta.appVersion || '0',
    centerName: meta.centerName || '',
    createdAt: new Date().toISOString(),
    platform: process.platform,
    note: 'clinic.db = LevelDB snapshot (Electron localStorage persistence)'
  }, null, 2);
}

function createClinicZipBuffer(meta) {
  const paths = getDataPaths();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-snapshot-'));
  const tmpLevel = path.join(tmpRoot, 'leveldb');
  const tmpIdx = path.join(tmpRoot, 'indexeddb');
  try {
    copyDirSafe(paths.levelDb, tmpLevel);
    copyDirSafe(paths.indexedDb, tmpIdx);
    const files = {};
    collectDirIntoZip(tmpLevel, 'clinic.db', files);
    if (!Object.keys(files).length) {
      collectDirIntoZip(paths.levelDb, 'clinic.db', files);
    }
    if (!Object.keys(files).length) {
      throw new Error('clinic_db_not_found');
    }
    collectDirIntoZip(tmpIdx, 'indexeddb', files);
    if (!Object.keys(files).some((k) => k.startsWith('indexeddb/'))) {
      collectDirIntoZip(paths.indexedDb, 'indexeddb', files);
    }
    files['backup.manifest'] = fflate.strToU8(buildManifest(meta || {}));
    const zipped = fflate.zipSync(files, { level: 6 });
    return Buffer.from(zipped);
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function extractZipToDir(zipBuf, targetRoot, onlyPrefix, renamePrefix) {
  const entries = fflate.unzipSync(new Uint8Array(zipBuf));
  for (const [rel, data] of Object.entries(entries)) {
    if (onlyPrefix && !rel.startsWith(onlyPrefix)) continue;
    let inner = onlyPrefix ? rel.slice(onlyPrefix.length).replace(/^\//, '') : rel;
    if (!inner || rel.endsWith('/')) {
      if (inner) fs.mkdirSync(path.join(targetRoot, renamePrefix || onlyPrefix || '', inner.replace(/\//g, path.sep)), { recursive: true });
      continue;
    }
    const diskRoot = renamePrefix || onlyPrefix || '';
    const dest = path.join(targetRoot, diskRoot, inner.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(data));
  }
}

function inspectClinicZipBuffer(zipBuf) {
  const entries = fflate.unzipSync(new Uint8Array(zipBuf));
  const names = Object.keys(entries);
  const hasClinicDb = names.some((k) => k.startsWith('clinic.db/'));
  const hasManifest = names.includes('backup.manifest');
  let manifest = null;
  if (hasManifest) {
    try {
      const raw = Buffer.from(entries['backup.manifest']).toString('utf8');
      manifest = JSON.parse(raw);
    } catch { /* keep null */ }
  }
  return {
    ok: hasClinicDb && hasManifest,
    hasClinicDb,
    hasManifest,
    manifest,
    entryCount: names.length,
  };
}

function backupExistingLevelDb() {
  const { levelDb, userData } = getDataPaths();
  if (!fs.existsSync(levelDb)) return null;
  const bak = path.join(userData, 'Local Storage', `leveldb.bak-${Date.now()}`);
  fs.cpSync(levelDb, bak, { recursive: true, filter: (src) => !shouldSkipLevelDbFile(path.basename(src)) });
  return bak;
}

function restoreClinicZipBuffer(zipBuf) {
  const check = inspectClinicZipBuffer(zipBuf);
  if (!check.ok) {
    const err = new Error('invalid_backup_zip_structure');
    err.code = 'INVALID_BACKUP_ZIP';
    err.details = check;
    throw err;
  }
  const paths = getDataPaths();
  const bak = backupExistingLevelDb();
  const levelParent = path.dirname(paths.levelDb);
  fs.mkdirSync(levelParent, { recursive: true });
  if (fs.existsSync(paths.levelDb)) {
    fs.rmSync(paths.levelDb, { recursive: true, force: true });
  }
  fs.mkdirSync(paths.levelDb, { recursive: true });
  extractZipToDir(zipBuf, levelParent, 'clinic.db', 'leveldb');
  const idxParent = path.dirname(paths.indexedDb);
  if (fs.existsSync(idxParent)) {
    try { fs.rmSync(paths.indexedDb, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  fs.mkdirSync(idxParent, { recursive: true });
  extractZipToDir(zipBuf, idxParent, 'indexeddb', 'IndexedDB');
  return { ok: true, backupPath: bak };
}

module.exports = {
  getDataPaths,
  createClinicZipBuffer,
  inspectClinicZipBuffer,
  restoreClinicZipBuffer,
  buildManifest
};
