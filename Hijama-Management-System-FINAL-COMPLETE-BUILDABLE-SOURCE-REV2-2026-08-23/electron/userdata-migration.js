/**
 * Legacy userData migration → canonical %APPDATA%/Cupping Center
 * DATA-002..DATA-006
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER_DATA_FOLDER = 'Cupping Center';
const MARKER = 'userdata-migration-v2-3-5.json';

const LEGACY_NAMES = [
  'Hijama Management System',
  'com.tadawi.cuppingcenter',
  'hijama-management-system',
  'NajjarTech',
  'تداوي',
  'Cupping-Center',
  'CuppingCenter',
];

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
}

function discoverLegacyRoots(appData, localAppData) {
  const found = [];
  const names = LEGACY_NAMES;
  for (const base of [appData, localAppData].filter(Boolean)) {
    for (const name of names) {
      const p = path.join(base, name);
      try {
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
          found.push(p);
        }
      } catch { /* ignore */ }
    }
  }
  return found;
}

function hasBusinessData(root) {
  const markers = [
    path.join(root, 'database', 'tadawi.db'),
    path.join(root, 'Local Storage'),
    path.join(root, 'cache'),
    path.join(root, 'CloudVault'),
  ];
  return markers.some((p) => fs.existsSync(p));
}

/**
 * @param {object} opts
 * @param {string} opts.canonicalRoot - target Cupping Center path
 * @param {string} opts.appData
 * @param {string} [opts.localAppData]
 * @param {function} [opts.log]
 * @param {function} [opts.integrityCheckDb] - optional (dbPath)=> {ok}
 */
function migrateUserDataIfNeeded(opts) {
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const canonical = path.normalize(opts.canonicalRoot || '');
  if (!canonical) return { ok: false, error: 'no_canonical' };

  const markerPath = path.join(canonical, MARKER);
  if (fs.existsSync(markerPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      return { ok: true, skipped: true, reason: 'marker_present', marker: prev };
    } catch {
      return { ok: true, skipped: true, reason: 'marker_present' };
    }
  }

  const canonicalHasData = fs.existsSync(canonical) && hasBusinessData(canonical);
  const candidates = discoverLegacyRoots(opts.appData, opts.localAppData)
    .map(path.normalize)
    .filter((p) => p !== canonical && hasBusinessData(p));

  if (!candidates.length) {
    fs.mkdirSync(canonical, { recursive: true });
    const marker = {
      completedAt: new Date().toISOString(),
      migrated: false,
      reason: 'no_legacy_data',
      canonical,
    };
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
    log('[userdata-migration] no legacy data; marker written');
    return { ok: true, migrated: false, marker };
  }

  if (canonicalHasData) {
    const marker = {
      completedAt: new Date().toISOString(),
      migrated: false,
      reason: 'canonical_already_populated',
      canonical,
      discoveredLegacy: candidates,
    };
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
    log('[userdata-migration] canonical already has data; not overwriting');
    return { ok: true, migrated: false, marker };
  }

  const source = candidates[0];
  const backupDir = path.join(
    opts.appData || path.dirname(canonical),
    `${USER_DATA_FOLDER}-migration-backup-${Date.now()}`
  );

  log(`[userdata-migration] backing up ${source} → ${backupDir}`);
  copyDirSync(source, backupDir);

  const dbSrc = path.join(source, 'database', 'tadawi.db');
  let checksum = null;
  if (fs.existsSync(dbSrc)) {
    checksum = sha256File(dbSrc);
    if (typeof opts.integrityCheckDb === 'function') {
      const integ = opts.integrityCheckDb(dbSrc);
      if (!integ || integ.ok !== true) {
        log('[userdata-migration] FAIL integrity on source — abort, keep original');
        return {
          ok: false,
          error: 'source_integrity_failed',
          source,
          backupDir,
          diagnostic: integ,
        };
      }
    }
  }

  log(`[userdata-migration] copying ${source} → ${canonical}`);
  copyDirSync(source, canonical);

  const dbDst = path.join(canonical, 'database', 'tadawi.db');
  if (checksum && fs.existsSync(dbDst)) {
    const after = sha256File(dbDst);
    if (after !== checksum) {
      log('[userdata-migration] checksum mismatch — leave source intact');
      return {
        ok: false,
        error: 'checksum_mismatch',
        source,
        backupDir,
        expected: checksum,
        actual: after,
      };
    }
    if (typeof opts.integrityCheckDb === 'function') {
      const integ = opts.integrityCheckDb(dbDst);
      if (!integ || integ.ok !== true) {
        return {
          ok: false,
          error: 'dest_integrity_failed',
          source,
          backupDir,
          diagnostic: integ,
        };
      }
    }
  }

  const marker = {
    completedAt: new Date().toISOString(),
    migrated: true,
    source,
    canonical,
    backupDir,
    dbChecksum: checksum,
    note: 'Source left intact until operator confirms; marker prevents re-run overwrite',
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  log('[userdata-migration] success; source NOT deleted');
  return { ok: true, migrated: true, marker };
}

module.exports = {
  USER_DATA_FOLDER,
  MARKER,
  LEGACY_NAMES,
  discoverLegacyRoots,
  hasBusinessData,
  migrateUserDataIfNeeded,
  sha256File,
  copyDirSync,
};
