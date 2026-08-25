#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 1 — bootstrap UX + discovery + sync lifecycle (static + unit).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const mainDiscovery = fs.readFileSync(path.join(root, 'electron/cloud-data-discovery.js'), 'utf8');
const rendererDiscovery = fs.readFileSync(path.join(root, 'cloud/cloud-data-discovery.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const syncLife = fs.readFileSync(path.join(root, 'cloud/sync-lifecycle.js'), 'utf8');
const safety = fs.readFileSync(path.join(root, 'cloud/pre-install-safety-snapshot.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');

check(/DISCOVERY_OVERALL_MS\s*=\s*150000/.test(mainDiscovery), 'discovery overall timeout 150s');
check(/NO_PROGRESS_WATCHDOG_MS\s*=\s*35000/.test(mainDiscovery), 'no-progress watchdog 35s');
check(/latestBackups/.test(mainDiscovery), 'main discovery exports latestBackups');
check(/computeStagePercent/.test(mainDiscovery), 'work-based stage percent');
check(!/elapsedMs \/ overallMs \* 90/.test(mainDiscovery.split('computeStagePercent')[0] || mainDiscovery),
  'time-ratio not primary in emitProgress default path');

check(/DISCOVERY_TIMEOUT_MS = 150000/.test(rendererDiscovery), 'renderer timeout 150s');
check(/runCloudScanForBackupPage/.test(rendererDiscovery), 'unified backup page scan API');
check(/Progress from main-process discovery only/.test(rendererDiscovery),
  'discoverAllSources uses main-process progress only (no time tick)');

check(/PATHS\.EXISTING/.test(boot) && /nameReadonly = isExisting/.test(boot),
  'EXISTING org name read-only');
check(/bf-cloud-backup-table/.test(boot), 'BootFlow shows backup table');
check(/SyncLifecycle/.test(boot), 'BootFlow uses sync lifecycle panel');

check(/CONFLICT_REQUIRES_ACTION/.test(syncLife), 'sync lifecycle conflict state');
check(/notReadyReason/.test(syncLife), 'not-ready shows reason');

check(/pre-install-or-migration\.tdw/.test(safety), 'safety tdw naming');
check(/ensureSafetySnapshotBeforeMigration/.test(safety), 'safety snapshot gate');
check(/PreInstallSafetySnapshot/.test(bridge), 'sqlite bridge hooks safety snapshot');

check(/runCloudScanForBackupPage/.test(index), 'backup page uses unified cloud scan');
check(/فحص السحابة/.test(index), 'backup page cloud scan label');
check(/sync-lifecycle\.js/.test(index), 'index loads sync-lifecycle');
check(/pre-install-safety-snapshot\.js/.test(index), 'index loads safety snapshot module');

const discovery = require(path.join(root, 'electron/cloud-data-discovery.js'));
assert.strictEqual(discovery.DISCOVERY_OVERALL_MS, 150000);
assert.strictEqual(discovery.NO_PROGRESS_WATCHDOG_MS, 35000);

const out = { restorePoints: [], googleConnected: true };
out.restorePoints.push(
  { kind: 'backup_file', modifiedAt: '2026-08-21T10:00:00Z', name: 'a.tdw' },
  { kind: 'backup_file', modifiedAt: '2026-08-20T10:00:00Z', name: 'b.tdw' },
  { kind: 'backup_file', modifiedAt: '2026-08-19T10:00:00Z', name: 'c.tdw' },
  { kind: 'backup_file', modifiedAt: '2026-08-18T10:00:00Z', name: 'd.tdw' },
);
discovery.finalizeRestorePoints(out);
check(out.latestBackups.length === 3, 'latestBackups capped at 3');
check(out.newest.name === 'a.tdw', 'newest is most recent backup');

const summary = discovery.buildDiscoverySummary(out, { centerId: 'c1', branchId: 'b1', localBranches: [{ id: 'b1' }] });
check(summary.organizations === 1 && summary.backups === 4, 'discovery summary counts');

const pctEarly = discovery.computeStagePercent('oauth', 1);
const pctLate = discovery.computeStagePercent('backups', 1);
check(pctLate > pctEarly, 'stage percent increases with progress');

if (errors.length) {
  console.error('FAIL:', errors.join('\n'));
  process.exit(1);
}
console.log('OK: RC Hotfix Round 1 bootstrap tests passed');
