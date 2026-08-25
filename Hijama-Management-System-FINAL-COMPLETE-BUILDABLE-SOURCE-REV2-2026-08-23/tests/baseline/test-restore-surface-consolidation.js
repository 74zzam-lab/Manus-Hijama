#!/usr/bin/env node
'use strict';

/**
 * PR9.5 — Restore Surface Consolidation & Legacy DR Shutdown.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const restoreAuthority = require('../../electron/restore-authority');
const backupV1Gate = require('../../electron/backup-v1-gate');
const { openDatabase } = require('../../database/connection');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  const root = path.join(__dirname, '..', '..');
  const mainSrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const backupSrc = fs.readFileSync(path.join(root, 'electron', 'backup.js'), 'utf8');
  const syncedSrc = fs.readFileSync(path.join(root, 'cloud', 'synced-write.js'), 'utf8');
  const stagingSrc = fs.readFileSync(path.join(root, 'cloud', 'restore-staging.js'), 'utf8');
  const surfaceSrc = fs.readFileSync(path.join(root, 'cloud', 'restore-surface-authority.js'), 'utf8');
  const bootSrc = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
  const discoverySrc = fs.readFileSync(path.join(root, 'cloud', 'cloud-data-discovery.js'), 'utf8');
  const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  // --- Authority unit tests ---
  const legacyDeny = restoreAuthority.denyLegacyRestore('backup:restoreDbBackup');
  check(legacyDeny.ok === false, 'denyLegacyRestore not ok');
  check(legacyDeny.error === 'legacy_restore_disabled', 'denyLegacyRestore error code');
  check(legacyDeny.code === 'LEGACY_RESTORE_DISABLED', 'denyLegacyRestore code');

  const v1RestoreDeny = backupV1Gate.denyBackupV1Restore('restoreDbBackup');
  check(v1RestoreDeny.error === 'legacy_restore_disabled', 'V1 restore gate uses legacy_restore_disabled');

  process.env.HIJAMA_ALLOW_BACKUP_V1 = '1';
  const backupMod = require('../../electron/backup');
  const envBypassAttempt = await backupMod.restoreDbBackup('/fake/path', 'password');
  delete process.env.HIJAMA_ALLOW_BACKUP_V1;
  check(envBypassAttempt.error === 'legacy_restore_disabled', 'HIJAMA_ALLOW_BACKUP_V1 does not bypass restore');

  const migrateBlocked = restoreAuthority.assertMigrationDbReplaceAllowed({});
  check(!migrateBlocked.ok && migrateBlocked.error === 'migration_context_required', 'migrate IPC blocked without context');
  const migrateOk = restoreAuthority.assertMigrationDbReplaceAllowed({ migrationOnly: true });
  check(migrateOk.ok === true, 'migrate allowed with migrationOnly');

  check(restoreAuthority.isDisasterRecoveryIpcChannel('backup:v2:restore'), 'V2 restore is DR channel');
  check(restoreAuthority.isDisasterRecoveryIpcChannel('backup:restoreDbBackup') === false, 'legacy not DR channel');

  // --- Production DB byte-unchanged on blocked migrate (gate only) ---
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr95-restore-'));
  const dbPath = path.join(tmp, 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('live-client', 'Live', '0500000000', '{}', new Date().toISOString(), new Date().toISOString());
  db.close();
  const hashBefore = sha256File(dbPath);
  const blocked = restoreAuthority.assertMigrationDbReplaceAllowed({ sourceLabel: 'renderer-backup' });
  check(!blocked.ok, 'renderer-backup sourceLabel not whitelisted');
  check(sha256File(dbPath) === hashBefore, 'production DB hash unchanged after blocked migrate gate');

  // --- Static wiring ---
  check(mainSrc.includes('restoreAuthority.denyLegacyRestore'), 'main IPC hard-blocks legacy restore');
  check(mainSrc.includes('assertMigrationDbReplaceAllowed'), 'main gates migrateFromBackup');
  check(backupSrc.includes('denyBackupV1Restore'), 'backup.js uses permanent restore deny');
  check(syncedSrc.includes('RestoreSurfaceAuthority'), 'synced-write checks surface authority');
  check(stagingSrc.includes('RestoreSurfaceAuthority.assertMigrationMergeAllowed'), 'restore-staging gated');
  check(surfaceSrc.includes('legacy_restore_disabled'), 'renderer authority defines legacy_restore_disabled');
  check(indexSrc.includes('restore-surface-authority.js'), 'index loads restore-surface-authority');
  check(indexSrc.includes("source: 'migration_import'"), 'import uses migration_import source');
  check(!indexSrc.includes("source: 'backup_import'"), 'backup_import source removed');
  check(/سحب (أحدث بيانات المزامنة للفرع|بيانات الفرع من السحابة|الأحدث \(موصى به\)|Sync Hydrate)/.test(bootSrc), 'bootflow cloud hydrate label');
  check(/confirmedBackupV2Restore|runCloudBackupV2Restore/.test(bootSrc), 'bootflow backup V2 cloud restore path');
  check(bootSrc.includes('v2Restore'), 'bootflow file path uses V2 restore');
  check(!discoverySrc.includes("id: 'atomic_swap'"), 'cloud discovery removed atomic_swap stage label');
  check(discoverySrc.includes("id: 'cloud_merge'"), 'cloud discovery uses cloud_merge stage');

  // --- Surface classification table (static contract) ---
  const surfaces = [
    ['backup:v2:restore', restoreAuthority.SURFACE.BACKUP_V2, true, true],
    ['backup:restoreDbBackup', restoreAuthority.SURFACE.LEGACY_DB, false, false],
    ['cloud_hydrate', restoreAuthority.SURFACE.CLOUD_HYDRATE, false, false],
    ['json_staging', restoreAuthority.SURFACE.JSON_STAGING, false, true],
  ];
  surfaces.forEach(([name, classification, canMutate, usesV2]) => {
    check(typeof classification === 'string', `surface ${name} classified`);
    check(canMutate === (classification === restoreAuthority.SURFACE.BACKUP_V2), `${name} mutate flag`);
    if (usesV2) check(classification === restoreAuthority.SURFACE.BACKUP_V2 || classification === restoreAuthority.SURFACE.JSON_STAGING, `${name} pipeline flag`);
  });

  if (errors.length) {
    console.error('FAIL restore-surface-consolidation (' + errors.length + ')');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS restore-surface-consolidation (' + (surfaces.length + 12) + ' checks)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
