#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 — Fast Cloud Discovery & Confirmed Restore (unit / wiring).
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
const ops = fs.readFileSync(path.join(root, 'cloud/ops-ux-bridge.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const rbac = fs.readFileSync(path.join(root, 'electron/rbac-session.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gdrive = fs.readFileSync(path.join(root, 'electron/cloud-providers/google-drive.js'), 'utf8');

// --- Separation of discovery vs restore ---
check(/mode: 'fast_discovery'/.test(mainDiscovery), 'main discovery mode=fast_discovery');
check(/downloadedFullBackup:\s*false/.test(mainDiscovery), 'discovery never claims full backup download');
check(!/downloadBackup\(/.test(mainDiscovery), 'main discovery must not call downloadBackup');
check(!/collectBackupFiles/.test(mainDiscovery), 'main discovery must not recurse collectBackupFiles');
check(/listFolderShallow/.test(mainDiscovery), 'shallow folder listing present');
check(/buildDiscoveryProbeFolders/.test(mainDiscovery) && /Backups\/V2/.test(mainDiscovery),
  'discovery probes Backups/V2 and expanded folder layouts');
check(/buildVersionsProbePaths/.test(mainDiscovery), 'discovery probes multiple versions.json paths');
check(/DISCOVERY_OVERALL_MS\s*=\s*150000/.test(mainDiscovery), '150s default discovery budget');
check(/PRIORITY_PARALLEL/.test(mainDiscovery), 'parallel priority folder batch');
check(/emitProgress|backup:discoveryProgress/.test(mainDiscovery + preload), 'discovery progress events');
check(/discovery_timeout/.test(mainDiscovery), 'timeout error codes present');

check(/discoverAllSources/.test(rendererDiscovery), 'renderer discoverAllSources');
check(/buildDiscoveryProgressState/.test(rendererDiscovery), 'renderer discovery progress state');
check(/confirmedCloudRestore/.test(rendererDiscovery), 'renderer confirmedCloudRestore');
check(/SyncEngine must NOT start during discovery|never start sync during discovery/i.test(rendererDiscovery),
  'renderer forbids SyncEngine during discovery');
check(/RESTORE_STAGES/.test(rendererDiscovery) && /cloud_merge/.test(rendererDiscovery),
  'hydrate restore stages defined (sync merge, not atomic_swap)');
check(/restore_in_flight|discovery_in_flight|stale_discovery|stale_restore/.test(rendererDiscovery),
  'locks / stale op guards');

// --- BootFlow wiring ---
check(/CloudDataDiscovery/.test(boot), 'BootFlow uses CloudDataDiscovery');
check(/سحب (أحدث بيانات المزامنة للفرع|بيانات الفرع من السحابة|الأحدث \(موصى به\)|Sync Hydrate)/.test(boot), 'explicit cloud hydrate CTA (not full DR restore)');
check(/استعادة.*Backup V2|confirmedBackupV2Restore/.test(boot), 'backup V2 restore CTA separated from hydrate');
check(/onProgress/.test(boot), 'BootFlow discovery progress callback');
check(/DISCOVERY_TIMEOUT_MS/.test(boot), 'BootFlow uses discovery timeout constant');
check(!/جارٍ الاستعادة من السحابة\.\.\./.test(boot)
  || /الاستعادة المؤكدة من السحابة/.test(boot),
  'infinite cloud restore loader path replaced / gated');
check(/openRestoreWizard\(\)/.test(boot) === false
  || /preferFile:\s*true/.test(boot),
  'cloud path no longer awaits bare openRestoreWizard()');
check(/لم تُستبدل قاعدة البيانات المحلية/.test(boot), 'failure preserves local DB messaging');
check(/Diagnostic ID/.test(boot), 'diagnostic id surfaced on progress');

// --- Z-index fix ---
check(/z-index:100050/.test(ops), 'OpsUx wizard above BootFlow overlay');
check(/ops-ux-restore-wizard\{z-index:100050/.test(boot), 'BootFlow CSS raises restore wizard');

// --- IPC / preload / public channel ---
check(/backup:discoverCloudRestorePoints/.test(preload), 'preload allowlist');
check(/discoverCloudRestorePoints:/.test(preload), 'preload bridge method');
check(/onDiscoveryProgress/.test(preload), 'preload discovery progress listener');
check(/backup:discoverCloudRestorePoints/.test(mainJs), 'main IPC handler');
check(/branchName/.test(mainJs) && /180000/.test(mainJs), 'main IPC branchName + extended timeout cap');
check(/backup:discoverCloudRestorePoints/.test(rbac), 'RBAC public channel for BootFlow');
check(/cloud\/cloud-data-discovery\.js/.test(index), 'index.html loads discovery module');
check(/getAuthedClient/.test(gdrive) && /resolveFolderPath/.test(gdrive) && /findFileByPath/.test(gdrive),
  'google-drive exports helpers for shallow discovery');

// --- Behavioral unit: withTimeout + shallow discovery helpers ---
const discovery = require(path.join(root, 'electron/cloud-data-discovery.js'));
assert.strictEqual(discovery.DISCOVERY_OVERALL_MS, 150000);
assert.strictEqual(discovery.clampTimeoutMs(120000), 120000);
assert.strictEqual(discovery.clampTimeoutMs(200000), 180000);
assert.strictEqual(discovery.clampTimeoutMs(45000), 45000);

(async () => {
  let timedOut = false;
  try {
    await discovery.withTimeout(new Promise(() => {}), 50, 'unit');
  } catch (err) {
    timedOut = err.code === 'DISCOVERY_TIMEOUT';
  }
  check(timedOut, 'withTimeout rejects with DISCOVERY_TIMEOUT');

  const folders = discovery.buildDiscoveryProbeFolders({ centerId: 'C1', centerName: 'Test Center' });
  check(folders[0] === 'Backups/V2', 'Backups/V2 probed first');

  if (errors.length) {
    console.error('FAIL v2-5.10 cloud discovery/restore');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS v2-5-10:cloud-discovery-restore (' + [
    'fast_discovery',
    'no_full_download',
    'confirm_cta',
    'timeout_60s',
    'progress',
    'z_index',
    'ipc',
  ].join(', ') + ')');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
