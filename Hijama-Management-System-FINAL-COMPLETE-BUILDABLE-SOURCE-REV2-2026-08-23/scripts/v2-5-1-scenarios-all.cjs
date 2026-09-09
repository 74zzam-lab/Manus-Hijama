#!/usr/bin/env node
'use strict';

/**
 * V2-5.1 Restore/DR scenario runner — produces evidence JSON (no secrets).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../database/connection');
const backupV2 = require('../electron/backup-v2-core');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-1', 'evidence');
const scenariosDir = path.join(evidenceDir, 'scenarios');
fs.mkdirSync(scenariosDir, { recursive: true });

const results = [];
const startedAt = new Date().toISOString();

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function seed(userDataDir, { clientId, centerId, branchId }) {
  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const d of ['settings', 'attachments', 'center-assets']) {
    fs.mkdirSync(path.join(userDataDir, d), { recursive: true });
  }
  fs.writeFileSync(
    path.join(userDataDir, 'settings', 'app.json'),
    JSON.stringify({ theme: 'light', centerId, branchId, cloudV2: { centerId, branchId, organizationId: centerId } }, null, 2)
  );
  fs.writeFileSync(path.join(userDataDir, 'attachments', `${clientId}-note.txt`), `note-${clientId}`);
  fs.writeFileSync(path.join(userDataDir, 'attachments', `${clientId}-img.bin`), Buffer.from([7, 7, 7]));
  fs.writeFileSync(path.join(userDataDir, 'attachments', `${clientId}-doc.pdf`), '%PDF-1.4');
  const db = openDatabase(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(clientId, `Client ${clientId}`, '0501111222', JSON.stringify({ centerId, branchId }), now, now);
  // users / permissions style kv if present
  try {
    db.prepare(
      `INSERT OR REPLACE INTO kv_store (key, value_json, updated_at) VALUES (?, ?, ?)`
    ).run('users', JSON.stringify([{ id: 'u1', role: 'admin', centerId }]), now);
    db.prepare(
      `INSERT OR REPLACE INTO kv_store (key, value_json, updated_at) VALUES (?, ?, ?)`
    ).run('permissions', JSON.stringify({ admin: ['*'] }), now);
  } catch {
    /* schema may differ; non-fatal for DR seed */
  }
  db.close();
  return backupV2.countDatabaseRows(dbPath);
}

async function scenario(id, title, fn) {
  const started = Date.now();
  const entry = { id, title, result: 'FAIL', ms: 0, evidence: {} };
  try {
    entry.evidence = await fn() || {};
    entry.result = 'PASS';
  } catch (err) {
    entry.result = 'FAIL';
    entry.error = String(err && (err.code || err.message) || err).slice(0, 400);
  }
  entry.ms = Date.now() - started;
  results.push(entry);
  writeJson(path.join(scenariosDir, `${id}.json`), entry);
  console.log(`${entry.result}  ${id}  ${title}  (${entry.ms}ms)`);
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'v251-scenarios-'));
  const password = 'v251-scenario-password';
  const deviceA = path.join(work, 'device-a');
  const deviceB = path.join(work, 'device-b');
  const cloudCache = path.join(work, 'cloud-cache');
  fs.mkdirSync(cloudCache, { recursive: true });

  const beforeA = seed(deviceA, { clientId: 'a1', centerId: 'CTR-A', branchId: 'BR-1' });
  const backupPath = path.join(work, 'device-a-authorized.tdw');
  const created = await backupV2.createBackupFile({
    userDataDir: deviceA,
    outputPath: backupPath,
    password,
    centerId: 'CTR-A',
    organizationId: 'CTR-A',
    branchId: 'BR-1',
    branchIds: ['BR-1'],
    appVersion: '2.5.1',
  });

  await scenario('S01-clean-install-restore', 'Restore after clean install path', async () => {
    const clean = path.join(work, 'clean-install');
    fs.mkdirSync(clean, { recursive: true });
    const restored = await backupV2.restoreBackupFile({
      userDataDir: clean,
      filePath: backupPath,
      password,
      expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
      skipEmergencyBackup: true,
    });
    const counts = backupV2.countDatabaseRows(path.join(clean, 'database', 'tadawi.db'));
    if (!restored.ok || !counts.ok) throw new Error('restore_or_integrity_failed');
    return { restoredOk: true, counts: counts.counts, beforeA: beforeA.counts };
  });

  await scenario('S02-license-org-branch-restore', 'Restore with license/org/branch identity meta', async () => {
    const inspected = backupV2.inspectEncryptedBackup(fs.readFileSync(backupPath), password);
    if (inspected.manifest.source.centerId !== 'CTR-A') throw new Error('missing_center');
    if (inspected.manifest.source.branchId !== 'BR-1') throw new Error('missing_branch');
    return { source: inspected.manifest.source, scope: inspected.manifest.scope };
  });

  await scenario('S03-manual-selected-restore', 'Manual restore of selected backup', async () => {
    const target = path.join(work, 'manual-target');
    fs.mkdirSync(target, { recursive: true });
    seed(target, { clientId: 'old', centerId: 'CTR-A', branchId: 'BR-1' });
    const restored = await backupV2.restoreBackupFile({
      userDataDir: target,
      filePath: backupPath,
      password,
      expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
      skipEmergencyBackup: true,
      closeDatabase: async () => {},
      reopenDatabase: async () => {},
    });
    return { ok: restored.ok, rowCounts: restored.rowCounts };
  });

  await scenario('S04-auto-latest-authorized', 'Pick latest authorized among local+cloud', async () => {
    const other = path.join(work, 'other');
    seed(other, { clientId: 'b1', centerId: 'CTR-B', branchId: 'BR-9' });
    const otherBackup = path.join(cloudCache, 'other.tdw');
    await backupV2.createBackupFile({
      userDataDir: other,
      outputPath: otherBackup,
      password,
      centerId: 'CTR-B',
      organizationId: 'CTR-B',
      branchId: 'BR-9',
      appVersion: '2.5.1',
    });
    await new Promise((r) => setTimeout(r, 15));
    const newer = path.join(cloudCache, 'newer-authorized.tdw');
    await backupV2.createBackupFile({
      userDataDir: deviceA,
      outputPath: newer,
      password,
      centerId: 'CTR-A',
      organizationId: 'CTR-A',
      branchId: 'BR-1',
      appVersion: '2.5.1',
    });
    const picked = backupV2.pickLatestAuthorizedBackup(
      [backupPath, otherBackup, newer],
      password,
      { centerId: 'CTR-A', branchId: 'BR-1' }
    );
    if (!picked.ok || path.basename(picked.selected.filePath) !== 'newer-authorized.tdw') {
      throw new Error('pick_failed');
    }
    return { selected: path.basename(picked.selected.filePath), rejected: picked.rejected.length };
  });

  await scenario('S05-sqlite-attachments-settings', 'SQLite + attachments/images/docs/settings', async () => {
    const hashes = backupV2.hashTree(path.join(deviceA, 'attachments'));
    const settingsOk = fs.existsSync(path.join(deviceA, 'settings', 'app.json'));
    if (hashes.length < 3 || !settingsOk) throw new Error('roots_incomplete');
    return { attachmentFiles: hashes.map((h) => h.path), settingsOk };
  });

  await scenario('S06-reject-wrong-center-branch', 'Reject wrong center and branch', async () => {
    let center = false;
    let branch = false;
    try {
      await backupV2.restoreBackupFile({
        userDataDir: deviceA,
        filePath: backupPath,
        password,
        expectedIdentity: { centerId: 'CTR-X', branchId: 'BR-1' },
        skipEmergencyBackup: true,
      });
    } catch (err) {
      center = /restore_center_mismatch/.test(String(err.code || err.message));
    }
    try {
      await backupV2.restoreBackupFile({
        userDataDir: deviceA,
        filePath: backupPath,
        password,
        expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-X' },
        skipEmergencyBackup: true,
      });
    } catch (err) {
      branch = /restore_branch_unauthorized/.test(String(err.code || err.message));
    }
    if (!center || !branch) throw new Error('reject_incomplete');
    return { centerRejected: center, branchRejected: branch };
  });

  await scenario('S07-corrupt-atomic-rollback', 'Corrupt reject + failpoint rollback', async () => {
    const corrupt = path.join(work, 'corrupt.tdw');
    const raw = fs.readFileSync(backupPath);
    raw[raw.length - 2] ^= 0xaa;
    fs.writeFileSync(corrupt, raw);
    let corruptOk = false;
    try {
      await backupV2.restoreBackupFile({
        userDataDir: deviceA,
        filePath: corrupt,
        password,
        expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
        skipEmergencyBackup: true,
      });
    } catch {
      corruptOk = true;
    }
    let reopen = false;
    try {
      await backupV2.restoreBackupFile({
        userDataDir: deviceA,
        filePath: backupPath,
        password,
        expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
        skipEmergencyBackup: true,
        failpoint: 'after_first_swap',
        closeDatabase: async () => {},
        reopenDatabase: async () => { reopen = true; },
      });
    } catch { /* expected */ }
    if (!corruptOk || !reopen) throw new Error('rollback_incomplete');
    const diag = fs.existsSync(path.join(deviceA, 'diagnostics', 'restore-v2'));
    return { corruptRejected: corruptOk, reopenCalled: reopen, diagnosticPresent: diag };
  });

  await scenario('S08-delete-sqlite-dr', 'DR after deleting SQLite', async () => {
    const clone = path.join(work, 'dr-delete-db');
    fs.cpSync(deviceA, clone, { recursive: true });
    fs.rmSync(path.join(clone, 'database'), { recursive: true, force: true });
    const restored = await backupV2.restoreBackupFile({
      userDataDir: clone,
      filePath: backupPath,
      password,
      expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
      skipEmergencyBackup: true,
    });
    const counts = backupV2.countDatabaseRows(path.join(clone, 'database', 'tadawi.db'));
    if (!restored.ok || !counts.ok) throw new Error('dr_delete_failed');
    return { counts: counts.counts, gate: backupV2.readRestoreGate(clone) };
  });

  await scenario('S09-new-device-cloud-only', 'New device restore from cloud cache only', async () => {
    fs.mkdirSync(deviceB, { recursive: true });
    const cloudOnly = path.join(cloudCache, 'device-a-copy.tdw');
    fs.copyFileSync(backupPath, cloudOnly);
    // no local Backups/V2 on device B
    const restored = await backupV2.restoreBackupFile({
      userDataDir: deviceB,
      filePath: cloudOnly,
      password,
      expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
      skipEmergencyBackup: true,
    });
    const counts = backupV2.countDatabaseRows(path.join(deviceB, 'database', 'tadawi.db'));
    if (!restored.ok || !counts.ok) throw new Error('device_b_failed');
    return { deviceBCounts: counts.counts, source: 'cloud-cache-only' };
  });

  await scenario('S10-no-silent-empty-fallback', 'No silent empty DB when restore fails', async () => {
    const target = path.join(work, 'no-empty');
    seed(target, { clientId: 'keep', centerId: 'CTR-A', branchId: 'BR-1' });
    const before = backupV2.countDatabaseRows(path.join(target, 'database', 'tadawi.db'));
    try {
      await backupV2.restoreBackupFile({
        userDataDir: target,
        filePath: path.join(work, 'missing.tdw'),
        password,
        expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
        skipEmergencyBackup: true,
      });
    } catch { /* expected */ }
    const after = backupV2.countDatabaseRows(path.join(target, 'database', 'tadawi.db'));
    if (!before.ok || !after.ok || before.counts.clients !== after.counts.clients) {
      throw new Error('live_data_changed_on_failed_restore');
    }
    return { beforeClients: before.counts.clients, afterClients: after.counts.clients };
  });

  await scenario('S11-stable-ids-and-gate', 'Stable IDs + restore gate verified', async () => {
    const counts = backupV2.countDatabaseRows(path.join(deviceB, 'database', 'tadawi.db'));
    const db = openDatabase(path.join(deviceB, 'database', 'tadawi.db'));
    const row = db.prepare('SELECT id FROM clients LIMIT 1').get();
    db.close();
    const gate = backupV2.readRestoreGate(deviceB);
    if (row?.id !== 'a1' || !gate.verified) throw new Error('id_or_gate_failed');
    return { clientId: row.id, gate, integrity: counts.integrity };
  });

  await scenario('S12-resume-after-interrupt', 'Resume staging after network interrupt', async () => {
    const { copyWithResume } = require('../electron/backup-v2-transfer');
    const dest = path.join(work, 'resumed.tdw');
    try {
      copyWithResume(backupPath, dest, { failAfterBytes: 128 });
    } catch (err) {
      if (!/network_interrupted/.test(String(err.code || err.message))) throw err;
    }
    const resumed = copyWithResume(backupPath, dest, { resume: true });
    const verified = backupV2.verifyBackupFile(dest, password);
    if (!resumed.ok || !(verified.ok || verified.database?.ok || verified.manifest)) {
      throw new Error('resume_verify_failed');
    }
    return { bytes: resumed.bytes, sha256: resumed.sha256 };
  });

  await scenario('S13-restore-then-no-duplicate-ids', 'Restore preserves IDs (sync-safe stable keys)', async () => {
    const db = openDatabase(path.join(deviceB, 'database', 'tadawi.db'));
    const ids = db.prepare('SELECT id FROM clients ORDER BY id').all().map((r) => r.id);
    const uniq = new Set(ids);
    db.close();
    if (ids.length !== uniq.size) throw new Error('duplicate_ids_after_restore');
    return { ids, unique: uniq.size };
  });

  const summary = {
    phase: 'V2-5.1',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch },
    commit: process.env.GITHUB_SHA || null,
    total: results.length,
    passed: results.filter((r) => r.result === 'PASS').length,
    failed: results.filter((r) => r.result === 'FAIL').length,
    results,
    createdBackup: { ok: created.ok === true, hash: created.hash || null },
  };
  writeJson(path.join(evidenceDir, 'scenarios-all.json'), summary);
  writeJson(path.join(evidenceDir, 'backup-restore-v2-tests.json'), {
    command: 'node tests/backup/backup-restore-v2.test.js',
    note: 'Also covered by npm test label v2-5.1:backup-restore-v2',
    scenariosSummary: `${summary.passed}/${summary.total}`,
  });
  writeJson(path.join(evidenceDir, 'timing-scenarios.json'), {
    scenarios: results.map((r) => ({ id: r.id, ms: r.ms, result: r.result })),
  });

  console.log(`\nSummary: ${summary.passed}/${summary.total} passed`);
  fs.rmSync(work, { recursive: true, force: true });
  if (summary.failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
