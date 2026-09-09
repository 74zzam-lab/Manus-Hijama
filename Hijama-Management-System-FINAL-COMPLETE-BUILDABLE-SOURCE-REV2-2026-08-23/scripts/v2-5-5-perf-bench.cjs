#!/usr/bin/env node
'use strict';

/**
 * V2-5.5 — median-of-3 performance benches over a scale dataset.
 * Default uses TINY dataset for speed; set V255_PERF_FULL=1 for FULL_TARGETS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../database/connection');
const { generateScaleDataset, TINY_TARGETS, FULL_TARGETS } = require('../database/scale-dataset');
const { createSyncPlatform } = require('../database/sync-outbox');
const {
  documentHost,
  runMedianOf3,
  assertNoClaimWithoutMeasurement,
} = require('../cloud/perf-harness');
const { backupFormatPolicy } = require('../electron/backup-v2-core');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-5', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function checkpoint(db) {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
}

async function main() {
  const full = process.env.V255_PERF_FULL === '1';
  const targets = full ? FULL_TARGETS : TINY_TARGETS;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'v255-perf-'));
  const dbPath = path.join(work, 'perf.db');
  const host = documentHost();
  const startedAt = new Date().toISOString();
  const benches = {};

  console.log(`perf-bench profile=${full ? 'FULL' : 'TINY'}`);

  // Seed once
  {
    const seed = openDatabase(dbPath);
    const gen = generateScaleDataset(seed, { ...targets, tiny: !full });
    seed.close();
    if (!gen.ok) throw new Error('scale_seed_failed');
    benches.scaleSeed = { ms: gen.ms, counts: gen.counts, targets: gen.targets };
  }

  benches.coldOpen = await runMedianOf3('coldOpen', () => {
    const db = openDatabase(dbPath);
    db.prepare('SELECT 1 AS ok').get();
    db.close();
  });

  let warmDb = openDatabase(dbPath);
  benches.warmOpen = await runMedianOf3('warmOpen', () => {
    warmDb.prepare('SELECT COUNT(*) AS c FROM clients').get();
  });

  benches.offlineStartup = await runMedianOf3('offlineStartup', () => {
    warmDb.prepare(`INSERT INTO sync_meta(key, value, updated_at) VALUES('network','offline',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run(new Date().toISOString());
    warmDb.prepare('SELECT value FROM sync_meta WHERE key=?').get('network');
  });

  benches.onlineStartup = await runMedianOf3('onlineStartup', () => {
    warmDb.prepare(`INSERT INTO sync_meta(key, value, updated_at) VALUES('network','online',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run(new Date().toISOString());
    warmDb.prepare('SELECT value FROM sync_meta WHERE key=?').get('network');
    warmDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE status=?').get('pending');
  });

  benches.dashboardQuery = await runMedianOf3('dashboardQuery', () => {
    warmDb.prepare('SELECT COUNT(*) AS visits, COALESCE(SUM(total),0) AS revenue FROM visits').get();
  });

  benches.clientSearch = await runMedianOf3('clientSearch', () => {
    warmDb.prepare(`SELECT id, name, phone FROM clients WHERE phone LIKE ? LIMIT 20`).all('%05000001%');
    warmDb.prepare(`SELECT id, name, phone FROM clients WHERE phone = ?`).get('0500000001');
  });

  benches.largeReport = await runMedianOf3('largeReport', () => {
    warmDb.prepare(
      `SELECT date, COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue FROM visits GROUP BY date ORDER BY date`
    ).all();
  });

  benches.largeExport = await runMedianOf3('largeExport', () => {
    warmDb.prepare(`SELECT id, client_id, date, total FROM visits ORDER BY date LIMIT 10000`).all();
  });

  benches.largeImport = await runMedianOf3('largeImport', (runIdx) => {
    const now = new Date().toISOString();
    const ins = warmDb.prepare(
      `INSERT OR REPLACE INTO clients (id, name, phone, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, '{}', ?, ?)`
    );
    const tx = warmDb.transaction(() => {
      for (let i = 0; i < 200; i++) {
        const id = `imp-${runIdx}-${i}`;
        ins.run(id, `Import ${i}`, `099${String(i).padStart(7, '0')}`, now, now);
      }
    });
    tx();
  });

  const backupPath = path.join(work, 'full-backup.db');
  benches.fullBackup = await runMedianOf3('fullBackup', () => {
    checkpoint(warmDb);
    warmDb.close();
    fs.copyFileSync(dbPath, backupPath);
    warmDb = openDatabase(dbPath);
  });

  const policy = backupFormatPolicy();
  if (policy.incremental.supported !== false) {
    throw new Error('incremental_must_be_unsupported');
  }
  benches.incrementalBackupPolicy = await runMedianOf3('incrementalBackupPolicy', () => {
    const p = backupFormatPolicy();
    if (p.incremental.supported !== false) throw new Error('incremental_supported_unexpected');
    assertNoClaimWithoutMeasurement('incremental_backup_unsupported', {
      medianMs: 0,
      policy: p.incremental,
    });
    return p;
  });
  benches.incrementalBackupPolicy.policy = policy.incremental;
  benches.incrementalBackupPolicy.note =
    'incremental.supported===false — evidence is policy + timing, not a fake incremental backup';

  const restorePath = path.join(work, 'restored.db');
  benches.fullRestore = await runMedianOf3('fullRestore', () => {
    checkpoint(warmDb);
    warmDb.close();
    fs.copyFileSync(backupPath, restorePath);
    fs.copyFileSync(backupPath, dbPath);
    warmDb = openDatabase(dbPath);
    warmDb.prepare('SELECT COUNT(*) AS c FROM clients').get();
  });

  const sync = createSyncPlatform(warmDb);
  benches.initialSync = await runMedianOf3('initialSync', (runIdx) => {
    const n = 50;
    const tx = warmDb.transaction(() => {
      for (let i = 0; i < n; i++) {
        sync.enqueue({
          center_id: 'CTR-PERF',
          branch_id: 'BR-MAIN',
          table_name: 'clients',
          record_id: `init-${runIdx}-${i}`,
          operation: 'UPDATE',
          base_revision: 0,
          new_revision: runIdx * 1000 + i + 1,
          payload_json: '{}',
          device_id: 'DEV-PERF',
        });
      }
    });
    tx();
  });

  benches.noChangePoll = await runMedianOf3('noChangePoll', () => {
    // Empty poll: claim with limit but filter to a branch that has no pending after clear, or just list pending count
    const pending = warmDb.prepare(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE status IN ('pending','inflight') AND branch_id=?`
    ).get('BR-EMPTY');
    return pending;
  });

  benches.singleEventPush = await runMedianOf3('singleEventPush', (runIdx) => {
    sync.enqueue({
      center_id: 'CTR-PERF',
      branch_id: 'BR-MAIN',
      table_name: 'visits',
      record_id: `push-${runIdx}-${Date.now()}`,
      operation: 'CREATE',
      base_revision: 0,
      new_revision: 900000 + runIdx,
      payload_json: '{}',
      device_id: 'DEV-PERF',
    });
    const claimed = sync.claimPending({ limit: 1, ignoreBackoff: true });
    if (claimed.length) sync.ack(claimed[0].event_id, 'rf-1');
  });

  async function flushBench(label, n) {
    return runMedianOf3(label, (runIdx) => {
      const tx = warmDb.transaction(() => {
        for (let i = 0; i < n; i++) {
          sync.enqueue({
            center_id: 'CTR-PERF',
            branch_id: 'BR-FLUSH',
            table_name: 'visits',
            record_id: `${label}-${runIdx}-${i}`,
            operation: 'UPDATE',
            base_revision: 0,
            new_revision: runIdx * 10000 + i + 1,
            payload_json: '{}',
            device_id: 'DEV-PERF',
          });
        }
      });
      tx();
      let left = n;
      while (left > 0) {
        const batch = sync.claimPending({ limit: Math.min(100, left), branch_id: 'BR-FLUSH', ignoreBackoff: true });
        if (!batch.length) break;
        for (const row of batch) sync.ack(row.event_id, 'rf-flush');
        left -= batch.length;
      }
    });
  }

  benches.flush100 = await flushBench('flush100', 100);
  benches.flush1000 = await flushBench('flush1000', 1000);

  benches.largeAttachmentMeta = await runMedianOf3('largeAttachmentMeta', () => {
    warmDb.prepare(
      `SELECT id, entity_type, entity_id, path, mime FROM attachments ORDER BY created_at LIMIT 5000`
    ).all();
    warmDb.prepare(`SELECT COUNT(*) AS c FROM attachments`).get();
  });

  // Claim gate evidence
  const claimCheck = assertNoClaimWithoutMeasurement(
    'dashboard_load_median_documented',
    benches.dashboardQuery
  );
  benches.claimGate = claimCheck;

  try { warmDb.close(); } catch { /* ignore */ }

  const finishedAt = new Date().toISOString();
  const summary = {};
  for (const [k, v] of Object.entries(benches)) {
    if (v && typeof v === 'object' && Array.isArray(v.runs)) {
      summary[k] = { medianMs: v.medianMs, runs: v.runs };
    }
  }

  const evidence = {
    phase: 'V2-5.5',
    startedAt,
    finishedAt,
    profile: full ? 'FULL' : 'TINY',
    targets,
    host,
    benches,
    summary,
  };

  writeJson(path.join(evidenceDir, 'perf-bench.json'), evidence);
  writeJson(path.join(evidenceDir, 'host.json'), { phase: 'V2-5.5', recordedAt: finishedAt, host });

  const baselineStub = {
    note: 'pre-V2-5.5 baseline stub (no historical median archive)',
    coldOpen: null,
    warmOpen: null,
    dashboardQuery: null,
  };
  writeJson(path.join(evidenceDir, 'before-after.json'), {
    phase: 'V2-5.5',
    recordedAt: finishedAt,
    baseline: baselineStub,
    current: summary,
    deltas: Object.fromEntries(
      Object.entries(summary).map(([k, v]) => [
        k,
        { currentMedianMs: v.medianMs, baselineMedianMs: baselineStub[k] ?? null },
      ])
    ),
  });

  console.log(JSON.stringify({ ok: true, profile: evidence.profile, summary }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
