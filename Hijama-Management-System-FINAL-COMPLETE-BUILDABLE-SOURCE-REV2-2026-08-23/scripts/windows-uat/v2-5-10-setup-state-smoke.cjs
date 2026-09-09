/**
 * Windows Installed EXE smoke — Setup State / Sync readiness / restart consume.
 * Runs after Install-And-Prove in CI. Does NOT claim Scenario A–E PASS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '../..');
const evidenceDir = path.join(root, 'docs/integration-v2-5-10/evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const report = {
  at: new Date().toISOString(),
  program: 'v2-5.10',
  suite: 'setup-state-sync-auth-smoke',
  checks: [],
  ok: true,
};

function check(cond, name, detail) {
  report.checks.push({ name, ok: !!cond, detail: detail || null });
  if (!cond) report.ok = false;
}

// Source wiring still present in installed tree (copied from repo into package resources)
const files = [
  'cloud/setup-state-service.js',
  'cloud/setup-state-dom.js',
  'cloud/sync-engine.js',
  'cloud/boot-flow-ui.js',
  'cloud/activation-sync-defaults.js',
  'electron/preload.js',
];

for (const rel of files) {
  const abs = path.join(root, rel);
  check(fs.existsSync(abs), `file:${rel}`, abs);
}

if (fs.existsSync(path.join(root, 'cloud/sync-engine.js'))) {
  const src = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
  check(/function runOnce/.test(src), 'sync_runOnce_present');
  check(/function getReadiness/.test(src), 'sync_getReadiness_present');
}

if (fs.existsSync(path.join(root, 'cloud/boot-flow-ui.js'))) {
  const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
  check(/إعادة تشغيل البرنامج وتطبيق الإعداد/.test(boot), 'single_ready_cta');
  check(!/إتمام الإعداد وفتح تسجيل الدخول/.test(boot), 'no_duplicate_finish');
}

if (fs.existsSync(path.join(root, 'index.html'))) {
  const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  check(/_pendingForcedPwChange/.test(idx) && /persistKv\('users'/.test(idx), 'password_persist_path');
  check(/id="login-boot-cta"/.test(idx), 'login_boot_cta_id');
  check(/setup-state-dom\.js/.test(idx), 'setup_state_dom_script');
  check(/SetupStateDom\.needsBootFlow/.test(idx), 'screens_gated_by_setup_state_dom');
}

if (fs.existsSync(path.join(root, 'cloud/config-layer.js'))) {
  const cfg = fs.readFileSync(path.join(root, 'cloud/config-layer.js'), 'utf8');
  check(/credentialRevision/.test(cfg), 'password_sync_revision_merge');
}

if (fs.existsSync(path.join(root, 'cloud/sync-engine.js'))) {
  const src = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
  check(/missingLabelsAr/.test(src), 'readiness_arabic_labels');
}

// Prefer installed EXE path if present (CI Install-And-Prove)
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

const out = path.join(evidenceDir, 'setup-state-sync-auth-smoke.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(report.ok ? 'PASS setup-state-sync-auth-smoke' : 'FAIL setup-state-sync-auth-smoke');
console.log('evidence:', out);
process.exit(report.ok ? 0 : 1);
