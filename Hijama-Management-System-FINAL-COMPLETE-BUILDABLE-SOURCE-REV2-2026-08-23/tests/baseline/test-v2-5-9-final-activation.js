#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/styles/design-system.css'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'license/ui/developer-panel.js'), 'utf8');
const defaultsSrc = fs.readFileSync(path.join(root, 'cloud/activation-sync-defaults.js'), 'utf8');
const inventory = fs.readFileSync(path.join(root, 'docs/integration-v2-5-9/00-INVENTORY.md'), 'utf8');
const readiness = fs.readFileSync(path.join(root, 'docs/integration-v2-5-9/FINAL-RELEASE-READINESS.md'), 'utf8');

check(/version:\s*'v2-5\.(9|10)'/.test(bootSrc), 'BootFlow v2-5.9+');
check(/autoDiscoverActivationAfterGoogle/.test(bootSrc), 'auto discovery after Google');
check(/NEW_STEPS\s*=\s*\[[^\]]*restore[^\]]*sync[^\]]*ready/.test(bootSrc.replace(/\s+/g, ' ')), 'NEW_STEPS includes restore/sync/ready');
check(!/NEW_STEPS\s*=\s*\[[^\]]*owner[^\]]*restore/.test(bootSrc.replace(/\s+/g, ' ')), 'NEW_STEPS must not include owner before restore');
check(/v2_5_9_no_auto_owner_bootstrap/.test(bootSrc), 'Owner Bootstrap gated for non-emergency');
check(/shouldAutoOpenBoot[\s\S]{0,500}bootParam === '1'/.test(bootSrc), 'shouldAutoOpenBoot honors explicit URL param');
check(/shouldAutoOpenBoot[\s\S]{0,500}needsBootScreen\(\)/.test(bootSrc), 'shouldAutoOpenBoot opens incomplete activation journey (PR38 parity)');
check(/branch_name_placeholder|اسمًا مخصصًا|اسماً مخصصاً/.test(bootSrc), 'custom first branch name enforced');
check(/restoreChoice === 'local'|restoreChoice === 'file'|markRestore\('local'/.test(bootSrc)
  || /markRestore\('local'|markRestore\('file'|markRestore\('empty'/.test(bootSrc), 'data source choices');
check(/RESTART_REQUIRED_KEY|restartRequired|إعادة تشغيل/.test(bootSrc), 'restart required messaging');

check(/role:'owner'/.test(indexSrc), 'seeded owner user');
check(/OWNER_SEED_PASSWORD_HASH|pbkdf2:owner:/.test(indexSrc), 'owner seed hash present (no plaintext required)');
check(/mustChangePassword:\s*true/.test(indexSrc), 'seed owner mustChangePassword flag');
check(/userMustChangePassword|openForcedPasswordChange|_pendingForcedPwChange/.test(indexSrc), 'forced password change gate');
check(/ensureOwnerSeedAccount/.test(indexSrc), 'owner seed dedupe helper');
check(/session restore must not skip forced|userMustChangePassword\(u\)/.test(indexSrc), 'session restore honors forced password change');
check(/data-forced|Cannot dismiss while forced|cp-forced/.test(indexSrc), 'forced modal non-dismissible');
check(!/Owner@12345/.test(indexSrc), 'seed plaintext must not appear in index.html');
check(!/requestOwnerBootstrap\('startup'\)/.test(indexSrc), 'no startup Owner Bootstrap');
check(!/requestOwnerBootstrap\('login'\)/.test(indexSrc), 'no login Owner Bootstrap');
check(/activation-sync-defaults\.js/.test(indexSrc), 'sync defaults script wired');
check(/lic-auth-grid|lic-activation-grid/.test(indexSrc), 'activation grid class on license screen');

check(/lic-activation-grid|activation-grid/.test(css) && /repeat\(3,\s*minmax\(220px,\s*1fr\)\)|repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css), '3-col activation grid CSS');
check(/--tdw-safe-block:\s*clamp\(24px,\s*5vh,\s*48px\)/.test(css), 'safe-area CSS variable');
check(/modal-shell/.test(css) && /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/.test(css), 'modal-shell header/body/footer grid');
check(/min-height:\s*0/.test(css) && /overscroll-behavior:\s*contain/.test(css), 'scroll body min-height + overscroll');
check(/login-box modal-shell|class="login-box modal-shell"/.test(indexSrc), 'login uses modal-shell');
{
  const cpIdx = indexSrc.indexOf('id="changePasswordModal"');
  const cpChunk = cpIdx >= 0 ? indexSrc.slice(cpIdx, cpIdx + 3500) : '';
  check(/modal-body/.test(cpChunk) && /modal-footer/.test(cpChunk) && /cp-save-btn/.test(cpChunk), 'change password shell body/footer');
}
check(/bf-card-footer[\s\S]{0,500}id="bf-step-actions"/.test(bootSrc), 'BootFlow actions in sticky footer');
check(/bf-restore-choices|bf-choice-actions/.test(bootSrc), 'restore data-source choices in scrollable body');
check(/STEP_SHORT/.test(bootSrc), 'compact stepper short labels');
check(/100dvh/.test(css) || /100dvh/.test(bootSrc), 'uses 100dvh for modal max-height');
check(/licSetVisibleStep/.test(indexSrc), 'license step visibility helper');
check(/lic-step-visible/.test(css) && /:not\(\.lic-step-visible\)/.test(css), 'manage step hidden until developer login');
check(!/#lic-step-manage\s*\{[^}]*display:\s*grid\s*!important/.test(css), 'must not force manage step grid !important');

const dialogsSrc = fs.readFileSync(path.join(root, 'cloud/tdw-dialogs.js'), 'utf8');
check(/tdwAskText|tdwConfirm/.test(dialogsSrc), 'Electron-safe dialogs module');
check(/tdw-dialogs\.js/.test(indexSrc), 'tdw-dialogs wired in index');
const hubSrc2 = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
check(!/global\.prompt\?\.|window\.prompt\(/.test(hubSrc2), 'Owner Hub must not call prompt()');
check(/tdwAskText|tdwAskPassword|tdwConfirm/.test(hubSrc2), 'Owner Hub uses tdw dialogs');
check(/ensureRbacSessionBound/.test(indexSrc), 'RBAC session bind helper');
check(/reconcileAuthUsersAfterHydrate/.test(indexSrc) && /AuthCredentialTruth\.ensureAuthCredentialsReady/.test(indexSrc), 'RBAC binds only after authoritative credential hydration');
check(!/seedUsersIfEmpty/.test(indexSrc), 'renderer must not retain a generic user-seed IPC path');
check(/confirmSync|dialogs\.confirmSync/.test(fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8')), 'Electron sync confirm exposed');
check(/dialog:confirmSync/.test(fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8')), 'main registers sync confirm');
check(/enterBranchMode/.test(hubSrc2) && /Branch Mode/.test(hubSrc2), 'Owner Hub enters Branch Mode after add');
check(fs.existsSync(path.join(root, 'docs/integration-v2-5-9/BRANCH-SYNC-OPS-GUIDE.md')), 'BRANCH-SYNC-OPS-GUIDE.md exists');
check(fs.existsSync(path.join(root, 'docs/integration-v2-5-9/SYNC-ARCHITECTURE-FINAL.md')), 'SYNC-ARCHITECTURE-FINAL.md exists');
check(fs.existsSync(path.join(root, 'cloud/restore-reconciliation.js')), 'restore-reconciliation module');
check(fs.existsSync(path.join(root, 'cloud/branch-contexts.js')), 'branch-contexts module');
check(/users_kv_empty/.test(fs.readFileSync(path.join(root, 'electron/rbac-session.js'), 'utf8')), 'RBAC denies empty KV');
check(/BRANCH_CREATION_PENDING/.test(fs.readFileSync(path.join(root, 'cloud/branch-enrollment.js'), 'utf8')), 'atomic branch pending');
check(/commitOperational/.test(fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8')), 'SQLite SoT commitOperational');
check(/afterRestoreDataSourceSelected|RestoreReconciliation/.test(fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8')), 'BootFlow uses restore reconciliation');
check(!/runCloudDbBackupNow\('post-local-restore'\)/.test(fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8')), 'no immediate post-local-restore push');
check(/deviceBoundBranch|operationalWriteBranch/.test(fs.readFileSync(path.join(root, 'cloud/branch-contexts.js'), 'utf8')), 'branch context split');
check(/ensureProfileFromOwnerUser/.test(fs.readFileSync(path.join(root, 'cloud/owner-profile.js'), 'utf8')), 'Owner profile heal from seeded user');
check(/profileOptional|OWNER_EXISTS/.test(fs.readFileSync(path.join(root, 'cloud/owner-management.js'), 'utf8')), 'seeded owner without profile is OWNER_EXISTS');
check(/Reset Owner Password/.test(panel), 'DevTools Reset Owner Password');
check(/Owner Support \(Developer Mode\)/.test(panel), 'DevTools Owner support framing');

check(/ActivationSyncDefaults/.test(defaultsSrc) && /applyDefaults/.test(defaultsSrc), 'ActivationSyncDefaults API');
check(/KEEP|MERGE|DELETE|BROKEN/.test(inventory), 'inventory classifications');
check(/Ready for release[\s\S]{0,40}\*\*NO\*\*|Ready for release[\s\S]{0,40}\bNO\b/i.test(readiness), 'Ready for release NO');
check(/Ready for main[\s\S]{0,40}\*\*NO\*\*|Ready for main[\s\S]{0,40}\bNO\b/i.test(readiness), 'Ready for main NO');

const sandbox = {
  console,
  settings: { backup: { providers: { google: { connected: true, email: 'a@b.c', oauth: true } }, cloudDb: {} } },
  DB: { get: () => null, set() {} },
  CloudMeta: { isCloudV2Enabled: () => false, setCloudV2Enabled() {}, loadMeta: () => ({}), saveMeta() {} },
  LicenseCloud: { loadLocal: () => ({ centerId: 'CTR-1' }) },
  DeviceConfig: { load: () => ({ lockedBranchId: 'BR-MAIN', deviceName: 'PC-1' }) },
  DriveAdapter: { isConnected: () => true },
  SyncEngine: { isRunning: () => false, start() { sandbox._started = true; } },
  SyncGuard: { resume() {} },
  SyncState: { load: () => ({}) },
  AuditLogger: { logSyncEvent() {} },
  licLoad: () => ({ expiry: '2099-01-01' }),
  _licStatus: 'valid'
};
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(defaultsSrc, sandbox, { timeout: 1000 });
check(!!sandbox.ActivationSyncDefaults?.isActivationBound?.(), 'activation bound when google+license+branch');
const applied = sandbox.ActivationSyncDefaults.applyDefaults({ startSync: true });
check(applied?.ok === true, 'applyDefaults ok');
check(sandbox.settings.backup.cloudEnabled === true, 'cloudEnabled default on');
check(sandbox.settings.cloudV2Enabled === true, 'cloudV2 default on');
check(sandbox._started === true, 'sync engine started');

const deviceSrc = fs.readFileSync(path.join(root, 'cloud/device-config.js'), 'utf8');
check(/lockToBranch/.test(deviceSrc), 'lockToBranch alias');
const opsSrc = fs.readFileSync(path.join(root, 'cloud/ops-ux-bridge.js'), 'utf8');
check(/openRestoreWizard:\s*runRestoreWizardFlow/.test(opsSrc), 'openRestoreWizard alias');
const scopeSrc = fs.readFileSync(path.join(root, 'cloud/branch-scope.js'), 'utf8');
check(/owner_mode_readonly/.test(scopeSrc), 'owner mode readonly');
check(/filterForActiveView/.test(scopeSrc), 'branch UI view filter');
const hubSrc = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
check(/approveDevice|Approvals|أجهزة معلّقة/.test(hubSrc), 'Owner Hub approvals section');
const switcher = fs.readFileSync(path.join(root, 'cloud/branch-switcher.js'), 'utf8');
check(/ALL_BRANCHES_VALUE|__ALL__|كل الفروع/.test(switcher), 'Branch drawer All Branches');

if (errors.length) {
  console.error('FAIL: v2-5.9 final activation');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: v2-5.9 final activation unit checks');
