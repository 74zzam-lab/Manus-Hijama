#!/usr/bin/env node
'use strict';

/**
 * V2-5.5 — performance, scale, DB maintenance, reliability unit suite.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const maint = require('../../database/db-maintenance');
const {
  generateScaleDataset,
  countTables,
  FULL_TARGETS,
  TINY_TARGETS,
} = require('../../database/scale-dataset');
const {
  documentHost,
  median,
  runMedianOf3,
  assertNoClaimWithoutMeasurement,
} = require('../../cloud/perf-harness');
const reliability = require('../../cloud/reliability-ops');
const { backupFormatPolicy } = require('../../electron/backup-v2-core');

require('../../cloud/sync-state.js');

const root = path.join(__dirname, '../..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-5', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const host = documentHost();
  check(host.platform && host.cpus >= 1, 'host_doc');
  check(median([3, 1, 2]) === 2, 'median');
  check(median([1, 2, 3, 4]) === 2.5, 'median_even');

  const m3 = await runMedianOf3('noop', () => {});
  check(m3.runs.length === 3 && Number.isFinite(m3.medianMs), 'median_of_3');
  assertNoClaimWithoutMeasurement('noop is fast', m3);
  let claimBlocked = false;
  try {
    assertNoClaimWithoutMeasurement('blazing fast', null);
  } catch {
    claimBlocked = true;
  }
  check(claimBlocked, 'claim_without_measurement_blocked');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'v255-unit-'));
  const dbPath = path.join(work, 'u.db');
  const db = openDatabase(dbPath);
  const pragmas = maint.applyOpenPragmas(db);
  check(pragmas.busyTimeout === 5000, 'busy_timeout_5000');
  check(String(pragmas.journalMode).toLowerCase() === 'wal', 'wal');

  const gen = generateScaleDataset(db, { tiny: true });
  check(gen.ok, 'tiny_scale_ok');
  check(gen.counts.clients === TINY_TARGETS.clients, 'tiny_clients');
  check(gen.counts.visits === TINY_TARGETS.visits, 'tiny_visits');

  const report = maint.maintenanceReport(db);
  check(report.analyze.ok, 'analyze');
  check(report.indexes.count >= 8, 'index_inventory');
  check(Array.isArray(report.missing.missing), 'missing_index_detect');
  check(report.samplePlan.ok, 'query_plan');
  check(report.vacuumPolicy.autoVacuumOnEveryStart === false, 'vacuum_policy');
  check(report.wal.ok, 'wal_checkpoint');
  check(report.foreignKeyCheck.ok, 'fk_check');
  check(report.integrityCheck.ok, 'integrity');

  const vacDenied = maint.runVacuum(db, {});
  check(vacDenied.ok === false, 'vacuum_denied_without_allow');

  const plan = maint.explainQueryPlan(db, 'SELECT id FROM clients WHERE phone = ?');
  check(plan.usesIndex || plan.plan.length > 0, 'explain_plan_rows');

  writeJson('db-maintenance.json', report);

  // Crash markers
  const markerDir = path.join(work, 'markers');
  for (const op of ['backup', 'sync', 'restore']) {
    reliability.beginOp(markerDir, op, { test: true });
    check(reliability.detectIncompleteOps(markerDir).incomplete.some((x) => x.op === op), `marker_${op}`);
    reliability.endOp(markerDir, op);
  }
  check(reliability.detectIncompleteOps(markerDir).ok, 'markers_cleared');
  reliability.beginOp(markerDir, 'backup', { crash: true });
  const recovered = reliability.recoverIncompleteOps(markerDir);
  check(recovered.recovered.includes('backup') && recovered.after.ok, 'crash_recover');

  // Log rotation
  const logPath = path.join(work, 'app.log');
  fs.writeFileSync(logPath, 'x'.repeat(300 * 1024));
  const rot = reliability.rotateLogIfNeeded(logPath, { maxBytes: 256 * 1024, maxFiles: 2 });
  check(rot.rotated === true && fs.existsSync(`${logPath}.1`), 'log_rotate');

  // Disk full / low mem classifiers
  const disk = reliability.classifyDiskError({ code: 'ENOSPC', message: 'no space left' });
  check(disk.diskFull && disk.kind === 'disk_full', 'disk_full');
  const mem = reliability.classifyMemoryPressure({ forceLow: true });
  check(mem.lowMemory, 'low_mem');

  // Retry backoff not tight loop
  const SyncState = globalThis.SyncState;
  const store = { data: null };
  globalThis.DB = {
    get: () => store.data,
    set: (_k, v) => { store.data = v; return v; },
  };
  store.data = SyncState.defaultState();
  const backoff = reliability.proveRetryBackoff(SyncState);
  check(backoff.ok && !backoff.tightLoop, 'retry_backoff');

  // Bounded queue
  store.data = SyncState.defaultState();
  for (let i = 0; i < SyncState.MAX_PENDING_PUSHES + 50; i++) {
    SyncState.queuePush({ layer: 'operational', table: 't' + i, branchId: 'B', revision: i });
  }
  const st = SyncState.getStatus();
  check(st.pending <= SyncState.MAX_PENDING_PUSHES, 'queue_bounded');
  check(st.pendingDropped >= 50, 'queue_dropped');

  // Incremental backup unsupported (policy evidence — do not fake)
  const pol = backupFormatPolicy();
  check(pol.incremental && pol.incremental.supported === false, 'incremental_unsupported');

  // Soak short + idle
  const soak = await reliability.runSoak({
    ms: 80,
    tickMs: 15,
    work: () => { /* idle */ },
  });
  check(soak.ok && soak.ticks >= 1 && soak.idleRatio > 0.5, 'soak_idle');
  check(!soak.leakSuspect, 'no_leak_short');

  db.close();

  // FULL targets constant present (generation proven by scale script evidence)
  check(FULL_TARGETS.clients === 100000, 'full_clients_target');
  check(FULL_TARGETS.visits === 500000, 'full_visits_target');

  const unitReport = {
    at: new Date().toISOString(),
    ok: errors.length === 0,
    host,
    errors,
    busyTimeout: pragmas.busyTimeout,
    tinyCounts: gen.counts,
    backoff,
    queue: st,
    incrementalPolicy: pol.incremental,
    soak,
  };
  writeJson('perf-scale-unit.json', unitReport);

  fs.rmSync(work, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: v2-5.5 performance');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-5.5 performance/scale/reliability unit');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
