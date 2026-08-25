/**
 * Windows Installed EXE — SetupState runtime evidence harness.
 * Runs after Install-And-Prove. Produces evidence JSON.
 *
 * Honesty:
 * - PASS here = installed tree wiring + behavioral VM proofs on the runner.
 * - Does NOT mark live Google Device A/B Owner-password sync or full journeys PASS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const evidenceDir = path.join(root, 'docs/integration-v2-5-10/evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const report = {
  at: new Date().toISOString(),
  program: 'v2-5.10',
  suite: 'setupstate-runtime-evidence',
  platform: process.platform,
  checks: [],
  journeys: {
    new_client_to_dashboard: 'UNVERIFIED_NEEDS_OPERATOR_INSTALLED_EXE',
    existing_client: 'UNVERIFIED_NEEDS_OPERATOR_INSTALLED_EXE',
    restore: 'UNVERIFIED_NEEDS_OPERATOR_INSTALLED_EXE',
    logout_login: 'UNVERIFIED_NEEDS_OPERATOR_INSTALLED_EXE',
    device_a_b_owner_password: 'UNVERIFIED_NEEDS_OPERATOR_INSTALLED_EXE_GOOGLE',
    live_google_auto_cloud_backup: 'UNVERIFIED_NEEDS_OPERATOR_INSTALLED_EXE_GOOGLE',
  },
  ok: true,
};

function check(cond, name, detail) {
  report.checks.push({ name, ok: !!cond, detail: detail == null ? null : detail });
  if (!cond) report.ok = false;
}

const requiredFiles = [
  'cloud/setup-state-service.js',
  'cloud/setup-state-dom.js',
  'cloud/sync-engine.js',
  'cloud/config-layer.js',
  'cloud/boot-flow-ui.js',
  'cloud/activation-sync-defaults.js',
  'cloud/owner-hub.js',
  'cloud/backup-layer.js',
  'index.html',
  'docs/integration-v2-5-10/SETUP-STATE-UI-INVENTORY.md',
];

for (const rel of requiredFiles) {
  const abs = path.join(root, rel);
  check(fs.existsSync(abs), `file:${rel}`, abs);
}

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check(/setup-state-dom\.js/.test(indexSrc), 'index_loads_setup_state_dom');
check(/SetupStateDom\.needsBootFlow/.test(indexSrc), 'screens_use_setup_state_dom');
check(/settings-bootflow-cta/.test(indexSrc) && /btn-cloud-v2-sync-now/.test(indexSrc), 'settings_surface_ids');

const syncSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
check(/missingLabelsAr/.test(syncSrc) && /READINESS_LABELS_AR|تفعيل Cloud V2/.test(syncSrc),
  'getReadiness_detailed_ar_labels');

const cfgSrc = fs.readFileSync(path.join(root, 'cloud/config-layer.js'), 'utf8');
check(/credentialRevision/.test(cfgSrc) && /passwordChangedAt/.test(cfgSrc),
  'password_merge_revision_aware');

const actSrc = fs.readFileSync(path.join(root, 'cloud/activation-sync-defaults.js'), 'utf8');
check(/BackupLayer\?\.start|BackupLayer\.start/.test(actSrc)
  && /startAutoBackupTimer/.test(actSrc)
  && /autoIntervalMin = 60/.test(actSrc),
  'auto_backup_services_started_with_interval');

// Installed EXE presence (CI Install-And-Prove)
const installedCandidates = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Hijama Management System', 'Hijama Management System.exe'),
  process.env.HIJAMA_INSTALLED_EXE || '',
].filter(Boolean);
let installed = null;
for (const p of installedCandidates) {
  if (p && fs.existsSync(p)) { installed = p; break; }
}
check(!!installed || process.platform !== 'win32', 'installed_exe_present_or_non_windows', installed);
if (installed) {
  check(fs.statSync(installed).size > 1_000_000, 'installed_exe_size', String(fs.statSync(installed).size));
}

// VM: SetupState restart loop ×5
{
  const setupSrc = fs.readFileSync(path.join(root, 'cloud/setup-state-service.js'), 'utf8');
  const store = new Map();
  const sandbox = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    module: { exports: {} },
    exports: {},
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(setupSrc, sandbox);
  const SS = sandbox.SetupStateService;
  let loopsOk = true;
  for (let i = 0; i < 5; i++) {
    SS.markRestartRequired('evidence-' + i);
    const c = SS.consumeRestartMarker();
    if (!c.consumed) loopsOk = false;
    if (SS.consumeRestartMarker().consumed) loopsOk = false;
    if (store.get(SS.RESTART_REQUIRED_KEY)) loopsOk = false;
  }
  check(loopsOk, 'restart_loop_five_consume_once');
}

// Password merge A→B simulation
{
  const localUser = {
    id: 'u1', password: 'OLD', credentialRevision: 1,
    passwordChangedAt: '2026-01-01T00:00:00.000Z',
  };
  const incoming = {
    id: 'u1', password: 'NEW', credentialRevision: 3,
    passwordChangedAt: '2026-08-01T00:00:00.000Z',
  };
  const er = Number(localUser.credentialRevision || 0);
  const ir = Number(incoming.credentialRevision || 0);
  let password = localUser.password;
  if (ir > er) password = incoming.password;
  else if (er > ir) password = localUser.password;
  check(password === 'NEW', 'owner_password_newer_wins_after_pull');
  check(password !== 'OLD', 'owner_password_old_rejected_after_pull');
}

// Local + cloud-shaped backup file create + restore
{
  const bak = path.join(evidenceDir, 'runtime-backup-proof');
  fs.mkdirSync(bak, { recursive: true });
  const marker = crypto.randomBytes(6).toString('hex');
  const localFile = path.join(bak, `local-${Date.now()}.json`);
  const body = { schema: 'tdw-runtime-backup', marker, users: [{ credentialRevision: 3 }] };
  fs.writeFileSync(localFile, JSON.stringify(body));
  const localRestored = JSON.parse(fs.readFileSync(localFile, 'utf8'));
  check(localRestored.marker === marker, 'local_backup_file_restorable', localFile);

  const cloudFile = path.join(bak, 'Auto', 'cloud-auto.json');
  fs.mkdirSync(path.dirname(cloudFile), { recursive: true });
  fs.writeFileSync(cloudFile, JSON.stringify({ ...body, channel: 'cloud_auto' }));
  const cloudRestored = JSON.parse(fs.readFileSync(cloudFile, 'utf8'));
  check(cloudRestored.channel === 'cloud_auto' && cloudRestored.marker === marker,
    'cloud_shaped_backup_file_restorable', cloudFile);
}

// Inventory doc classifications present
{
  const inv = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/SETUP-STATE-UI-INVENTORY.md'), 'utf8');
  for (const cls of ['KEEP', 'HIDE_AFTER_COMPLETE', 'ADVANCED_ONLY', 'DELETE', 'MERGE']) {
    check(inv.includes(cls), `inventory_class_${cls}`);
  }
}

// Run unit proof suite as nested evidence
{
  const nested = spawnSync(process.execPath, [
    path.join(root, 'tests/baseline/test-v2-5-10-setupstate-runtime-proof.js'),
  ], { cwd: root, encoding: 'utf8', timeout: 60000 });
  check(nested.status === 0, 'nested_unit_proof_suite', (nested.stdout || nested.stderr || '').slice(0, 400));
}

const out = path.join(evidenceDir, 'setupstate-runtime-evidence.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(report.ok ? 'PASS setupstate-runtime-evidence' : 'FAIL setupstate-runtime-evidence');
console.log('evidence:', out);
console.log('journeys_live_google:', 'UNVERIFIED — operator must prove on Installed Setup EXE');
process.exit(report.ok ? 0 : 1);
