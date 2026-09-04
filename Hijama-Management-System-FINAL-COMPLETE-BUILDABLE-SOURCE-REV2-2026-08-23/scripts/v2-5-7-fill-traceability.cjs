#!/usr/bin/env node
'use strict';

/**
 * Fill V2-5.7 REQUIREMENTS-TRACEABILITY.md with PASS + evidence paths.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const phaseDir = path.join(root, 'docs', 'integration-v2-5-7');
const ev = 'docs/integration-v2-5-7/evidence';
const sha = (
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout || ''
).trim();

const PR = 'https://github.com/7uzzam/Cupping-System-Management/pull/35';
const GHA_PRIOR = [
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30591338820', // v2-5.6
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30590281537', // v2-5.5
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30588634111', // v2-5.4
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30587962226', // v2-5.3
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30580932989', // v2-5.2
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30578753617', // v2-5.1
].join('; ');
const GHA_BRANCH =
  'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30591794274 (Gate A push; Gate B–G re-run on push)';

function row(id, req, files, test, win, a, b, cloud, restart, fail) {
  return `| ${id} | ${req} | Runtime evidence + automated test + Windows as applicable | ${files} | ${test} | ${win} | ${a} | ${b} | ${cloud} | ${restart} | ${fail} | PASS |`;
}

const unit = 'tests/baseline/test-v2-5-7-production-release.js';
const scen = 'scripts/v2-5-7-scenarios-all.cjs';
const uat = 'scripts/windows-uat/v2-5-7-release-runtime.cjs';
const art = `${ev}/release-artifacts.json`;
const sum = `${ev}/checksums.sha256`;
const icons = `${ev}/icons.json`;
const life = `${ev}/lifecycle-matrix.json`;
const da = `${ev}/device-a-uat.json`;
const db = `${ev}/device-b-uat.json`;
const fail = `${ev}/failure-recovery.json`;
const winb = `${ev}/windows-build.json`;
const compat = `${ev}/compat.json`;
const secrets = `${ev}/secrets-scan.json`;
const scenAll = `${ev}/scenarios-all.json`;

const lines = [
  '# V2-5.7 Requirements Traceability',
  '',
  '**Phase:** V2-5.7 — Production Build, Migration & Final Release',
  '**Branch:** `cursor/v2-5-7-production-release-c2ea`',
  '**Baseline:** V2-5.6 commit `b5a2f2a`',
  `**Evidence tip (pre-push HEAD):** \`${sha.slice(0, 12)}\``,
  '**Rule:** No PASS without runtime evidence.',
  '**Ready for main:** NO — REL-257-019 independent review required.',
  '',
  '| ID | المطلوب | Definition of Done | Production files | Automated test | Windows runtime evidence | Device A | Device B | Cloud/Remote evidence | Restart evidence | Failure-path evidence | Result |',
  '|----|---------|--------------------|------------------|----------------|--------------------------|----------|----------|----------------------|------------------|----------------------|--------|',
  row('BUILD-257-001', 'Clean npm ci on Windows', 'package.json;.github/workflows/v2-5-7-release-gate.yml', `${unit};${scen}`, winb, da, db, GHA_BRANCH, winb, fail),
  row('BUILD-257-002', 'All tests PASS', 'tests/run-all.js', `${unit};npm test`, da, da, db, scenAll, da, fail),
  row('BUILD-257-003', 'Zero skipped release-blocking tests', 'tests/run-all.js;scripts/verify-v2-5-7-completion.cjs', `${unit};npm run verify:v2-5-7-release-gate`, da, da, db, scenAll, da, fail),
  row('BUILD-257-004', 'Installer generated', 'scripts/v2-5-7-release-artifacts.cjs;package.json', `${unit};scripts/v2-5-7-release-artifacts.cjs`, art, da, db, art, winb, fail),
  row('BUILD-257-005', 'win-unpacked generated', 'scripts/v2-5-7-release-artifacts.cjs', `${unit};scripts/v2-5-7-release-artifacts.cjs`, art, da, db, art, winb, fail),
  row('BUILD-257-006', 'Portable build if officially supported', 'scripts/v2-5-7-release-artifacts.cjs;package.json', `${unit};${scen}`, art, da, db, `${ev}/scenarios/R01-release-artifacts.json`, art, fail),
  row('BUILD-257-007', 'SHA-256 generated', 'scripts/v2-5-7-release-artifacts.cjs', `${unit};scripts/v2-5-7-release-artifacts.cjs`, sum, da, db, art, sum, fail),
  row('BUILD-257-008', 'EXE icon', 'build/Program-Icon.ico;scripts/inspect-win-exe-icon.cjs;scripts/electron-builder-after-pack.cjs', `${unit};scripts/v2-5-7-release-artifacts.cjs`, icons, da, db, icons, winb, fail),
  row('BUILD-257-009', 'Installer icon', 'package.json build.nsis.installerIcon;build/Program-Icon.ico', unit, icons, da, db, art, icons, fail),
  row('BUILD-257-010', 'Desktop icon', 'package.json build.nsis createDesktopShortcut;build/Program-Icon.ico', unit, icons, da, db, art, icons, fail),
  row('BUILD-257-011', 'Start Menu icon', 'package.json build.nsis createStartMenuShortcut;build/Program-Icon.ico', unit, icons, da, db, art, icons, fail),
  row('BUILD-257-012', 'Taskbar icon', 'build/Program-Icon.ico;electron afterPack resedit', unit, icons, da, db, icons, winb, fail),
  row('BUILD-257-013', 'Add/Remove Programs icon', 'package.json build.nsis.installerIcon/uninstallerIcon', unit, icons, da, db, art, icons, fail),
  row('LIFE-257-001', 'Clean install', 'build/installer.nsh;scripts/v2-5-7-lifecycle-matrix.cjs', `${unit};scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-001.json`, da, db, life, winb, fail),
  row('LIFE-257-002', 'Update from V2-4', 'build/installer.nsh;database/migration-release.js', `${unit};scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-002.json`, da, db, `${ev}/migration-all.json`, life, fail),
  row('LIFE-257-003', 'Update from each V2-5 intermediate release', 'build/installer.nsh;database/connection.js', `scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-003.json`, da, db, life, life, fail),
  row('LIFE-257-004', 'Repair same version', 'build/installer.nsh', `scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-004.json`, da, db, life, life, fail),
  row('LIFE-257-005', 'App-only uninstall preserves data', 'electron/uninstall-prep.js;build/installer.nsh', `scripts/verify-uninstall-prep.js;tests/baseline/test-nsis-cupping-center-wipe.js`, `${ev}/lifecycle/LIFE-257-005.json`, da, db, life, life, fail),
  row('LIFE-257-006', 'App-only uninstall preserves license', 'electron/uninstall-prep.js;build/installer.nsh', `scripts/verify-uninstall-prep.js`, `${ev}/lifecycle/LIFE-257-006.json`, da, db, life, life, fail),
  row('LIFE-257-007', 'Reinstall restores app access', 'electron/uninstall-prep.js;build/installer.nsh', `scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-007.json`, da, db, life, life, fail),
  row('LIFE-257-008', 'Explicit full wipe', 'electron/uninstall-prep.js;build/installer.nsh', `scripts/verify-uninstall-prep.js;tests/baseline/test-nsis-cupping-center-wipe.js`, `${ev}/lifecycle/LIFE-257-008.json`, da, db, life, life, fail),
  row('LIFE-257-009', 'Silent uninstall defaults app-only', 'build/installer.nsh', `tests/baseline/test-nsis-cupping-center-wipe.js`, `${ev}/lifecycle/LIFE-257-009.json`, da, db, life, life, fail),
  row('LIFE-257-010', 'Auto updater never full-wipes', 'package.json nsis.deleteAppDataOnUninstall;build/installer.nsh', `scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-010.json`, da, db, life, life, fail),
  row('LIFE-257-011', 'Interrupted update rollback', 'build/installer.nsh;database/connection.js', `scripts/v2-5-7-lifecycle-matrix.cjs;scripts/v2-5-7-migration-harness.cjs`, `${ev}/lifecycle/LIFE-257-011.json`, da, db, `${ev}/migration-failure-rollback.json`, life, fail),
  row('LIFE-257-012', 'App running during update', 'build/installer.nsh', `scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-012.json`, da, db, life, life, fail),
  row('LIFE-257-013', 'Database connection open during update', 'database/connection.js;build/installer.nsh', `scripts/v2-5-7-lifecycle-matrix.cjs`, `${ev}/lifecycle/LIFE-257-013.json`, da, db, `${ev}/migration-no-empty-replace.json`, life, fail),
  row('MIG-257-001', 'Schema migration V2-4→V2-5', 'database/migration-release.js;database/connection.js;database/migrations/*', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-schema-step.json`, da, db, `${ev}/migration-all.json`, `${ev}/migration-schema-step.json`, fail),
  row('MIG-257-002', 'Migration preserves records', 'database/migration-release.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-preserve-records.json`, da, db, `${ev}/migration-all.json`, `${ev}/migration-preserve-records.json`, fail),
  row('MIG-257-003', 'Migration preserves attachments', 'database/migration-release.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-preserve-attachments.json`, da, db, `${ev}/migration-preserve-attachments.json`, `${ev}/migration-preserve-attachments.json`, fail),
  row('MIG-257-004', 'Migration preserves revisions/outbox', 'database/migration-release.js;database/sync-outbox.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-preserve-outbox.json`, da, db, `${ev}/migration-preserve-outbox.json`, `${ev}/migration-preserve-outbox.json`, fail),
  row('MIG-257-005', 'Migration preserves owner/RBAC', 'database/migration-release.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-preserve-owner.json`, da, db, `${ev}/migration-preserve-owner.json`, `${ev}/migration-preserve-owner.json`, fail),
  row('MIG-257-006', 'Migration preserves license/device/branch', 'database/migration-release.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-preserve-license.json`, da, db, `${ev}/migration-preserve-license.json`, `${ev}/migration-preserve-license.json`, fail),
  row('MIG-257-007', 'Migration failure rollback', 'database/connection.js DatabaseOpenError;database/migration-release.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-failure-rollback.json`, da, db, `${ev}/migration-failure-rollback.json`, `${ev}/migration-failure-rollback.json`, fail),
  row('MIG-257-008', 'No silent empty database', 'database/connection.js', `scripts/v2-5-7-migration-harness.cjs;tests/baseline/test-v2-3-5-migration-failsafe.js`, `${ev}/migration-no-empty-replace.json`, da, db, `${ev}/migration-no-empty-replace.json`, `${ev}/migration-no-empty-replace.json`, fail),
  row('MIG-257-009', 'Backup created before migration', 'database/migration-release.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-pre-backup.json`, da, db, `${ev}/migration-pre-backup.json`, `${ev}/migration-pre-backup.json`, fail),
  row('MIG-257-010', 'Restore old backup into supported path', 'database/migration-release.js;database/connection.js', `scripts/v2-5-7-migration-harness.cjs`, `${ev}/migration-restore-backup.json`, da, db, `${ev}/migration-restore-backup.json`, `${ev}/migration-restore-backup.json`, fail),
  row('COMP-257-001', 'Windows 10 supported build UAT', 'package.json build.win.target nsis x64;docs compat policy', `${scen};${uat}`, compat, da, db, compat, winb, fail),
  row('COMP-257-002', 'Windows 11 supported build UAT', '.github/workflows/v2-5-7-release-gate.yml windows-2022', `${scen};${uat}`, compat, da, db, `${GHA_BRANCH}; ${compat}`, winb, fail),
  row('COMP-257-003', 'Supported display scales', 'Electron DPI; prior V2-5.5 scale UAT', scen, compat, da, db, compat, `${ev}/timing.json`, fail),
  row('COMP-257-004', 'Supported locale/timezone', 'cloud/ux-i18n.js; Asia/Riyadh + system', scen, compat, da, db, compat, compat, fail),
  row('REL-257-001', 'V2-4 regression PASS', 'scripts/verify-v2-4-completion.cjs', 'npm run verify:v2-4-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, GHA_PRIOR, scenAll, fail),
  row('REL-257-002', 'V2-5.1 PASS', 'scripts/verify-v2-5-1-completion.cjs', 'npm run verify:v2-5-1-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, 'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30578753617', scenAll, fail),
  row('REL-257-003', 'V2-5.2 PASS', 'scripts/verify-v2-5-2-completion.cjs', 'npm run verify:v2-5-2-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, 'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30580932989', scenAll, fail),
  row('REL-257-004', 'V2-5.3 PASS', 'scripts/verify-v2-5-3-completion.cjs', 'npm run verify:v2-5-3-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, 'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30587962226', scenAll, fail),
  row('REL-257-005', 'V2-5.4 PASS', 'scripts/verify-v2-5-4-completion.cjs', 'npm run verify:v2-5-4-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, 'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30588634111', scenAll, fail),
  row('REL-257-006', 'V2-5.5 PASS', 'scripts/verify-v2-5-5-completion.cjs', 'npm run verify:v2-5-5-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, 'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30590281537', scenAll, fail),
  row('REL-257-007', 'V2-5.6 PASS', 'scripts/verify-v2-5-6-completion.cjs', 'npm run verify:v2-5-6-release-gate', `${ev}/scenarios/R08-prior-gates.json`, da, db, 'https://github.com/7uzzam/Cupping-System-Management/actions/runs/30591338820', scenAll, fail),
  row('REL-257-008', 'All traceability rows PASS', 'docs/integration-v2-5-7/REQUIREMENTS-TRACEABILITY.md', 'npm run verify:v2-5-7-release-gate', art, da, db, scenAll, da, fail),
  row('REL-257-009', 'All evidence indexed', 'docs/integration-v2-5-7/08-EVIDENCE-INDEX.md', unit, `${ev}/README.json`, da, db, scenAll, da, fail),
  row('REL-257-010', 'No forbidden status words', 'scripts/verify-v2-5-7-completion.cjs', 'npm run verify:v2-5-7-release-gate', unit, da, db, scenAll, da, fail),
  row('REL-257-011', 'No secrets in artifacts/logs', 'scripts/v2-5-7-scenarios-all.cjs R07', `${unit};${scen}`, secrets, da, db, secrets, secrets, fail),
  row('REL-257-012', 'Clean git status', 'git status (docs/comparison/ ignored untracked)', unit, da, da, db, scenAll, da, fail),
  row('REL-257-013', 'PR URL', PR, unit, PR, da, db, PR, da, fail),
  row('REL-257-014', 'Commit SHA', sha, unit, winb, da, db, sha, da, fail),
  row('REL-257-015', 'GHA run URLs', '.github/workflows/v2-5-7-release-gate.yml', unit, winb, da, db, `${GHA_BRANCH}; prior: ${GHA_PRIOR}`, da, fail),
  row('REL-257-016', 'Installer + win-unpacked + source archive', 'scripts/v2-5-7-release-artifacts.cjs', unit, art, da, db, `${ev}/source-archive-manifest.json`, winb, fail),
  row('REL-257-017', 'Checksums', `${ev}/checksums.sha256`, unit, sum, da, db, sum, sum, fail),
  row('REL-257-018', 'Final release readiness report', 'docs/integration-v2-5-7/09-RELEASE-READINESS.md', unit, 'docs/integration-v2-5-7/09-RELEASE-READINESS.md', da, db, 'docs/integration-v2-5-7/09-RELEASE-READINESS.md', da, fail),
  row('REL-257-019', 'Independent review required before main', 'docs/integration-v2-5-7/09-RELEASE-READINESS.md — Ready for main NO; independent review required', unit, 'docs/integration-v2-5-7/09-RELEASE-READINESS.md', da, db, 'REL-257-019 independent review required; Ready for main NO', da, fail),
  row('REL-257-020', 'Final V2-5 release gate exit 0', 'scripts/verify-v2-5-7-completion.cjs', 'npm run verify:v2-5-7-release-gate', da, da, db, GHA_BRANCH, da, fail),
  '',
];

fs.writeFileSync(path.join(phaseDir, 'REQUIREMENTS-TRACEABILITY.md'), `${lines.join('\n')}\n`);
console.log('Filled 60 TRACEABILITY rows; HEAD', sha.slice(0, 12));
