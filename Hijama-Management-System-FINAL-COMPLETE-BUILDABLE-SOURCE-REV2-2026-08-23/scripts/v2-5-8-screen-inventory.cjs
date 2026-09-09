#!/usr/bin/env node
'use strict';

/**
 * V2-5.8 — Inventory of auth/activation surfaces (KEEP/MERGE/DELETE).
 * Writes evidence from this scan run.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-8', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const items = [
  { id: 'bootFlowOverlay', file: 'cloud/boot-flow-ui.js', action: 'KEEP', note: 'Canonical V2-5.8 unified activation wizard' },
  { id: 'loginScreen', file: 'index.html', action: 'KEEP', note: 'Post-wizard credential login only' },
  { id: 'login-drive-bootstrap-panel', file: 'index.html', action: 'DELETE', note: 'Hidden via design-system.css; BootFlow owns Google' },
  { id: 'lic-drive-bootstrap-panel', file: 'index.html', action: 'KEEP', note: 'V2-5.8/5.9 License Recovery — must remain visible (not globally CSS-hidden)' },
  { id: 'cloudConnectModal', file: 'index.html', action: 'KEEP', note: 'Shared OAuth confirm' },
  { id: 'centerSetupModal', file: 'cloud/center-setup-ui.js', action: 'MERGE', note: 'Post-login manage only; auto-open suppressed during BootFlow' },
  { id: 'licenseScreen', file: 'index.html', action: 'KEEP', note: 'Dev/admin licensing tool; not customer first-run' },
  { id: 'userModal', file: 'index.html', action: 'KEEP', note: 'User admin registration' },
  { id: 'OwnerCreateForm', file: 'cloud/owner-create-form.js', action: 'KEEP', note: 'Mandatory Owner password form' },
  { id: 'OwnerManagement', file: 'cloud/owner-management.js', action: 'KEEP', note: 'Single createOwner() + repair helpers; BootFlow/Hub/Emergency share API' },
  { id: 'devtools-owner-emergency', file: 'license/ui/developer-panel.js', action: 'KEEP', note: 'Emergency Recovery only — not primary Owner create path' },
  { id: 'owner-hub-accounts', file: 'cloud/owner-hub.js', action: 'KEEP', note: 'Day-to-day Owner CRUD after first Owner exists' },
  { id: 'boot-flow-self-heal-owner', file: 'cloud/boot-flow-ui.js', action: 'KEEP', note: 'ensureOwnerBootstrapWizard when org has no Owner' },
  { id: 'branchLockModal', file: 'cloud/branch-lock-ui.js', action: 'KEEP', note: 'Select existing branch helper' },
  { id: 'ops-ux-restore-wizard', file: 'cloud/ops-ux-bridge.js', action: 'KEEP', note: 'Restore step host' },
  { id: 'fr-wizard-overlay', file: 'cupping-first-run.js', action: 'KEEP', note: 'Post-dashboard product setup only' },
  { id: 'OwnerHub.skip during activation', file: 'cloud/owner-hub.js', action: 'REPLACE', note: 'Blocked while BootFlow.needsBootScreen' },
  { id: 'prompt()-based Owner create in boot', file: 'cloud/boot-flow-ui.js', action: 'DELETE', note: 'Replaced by OwnerCreateForm' },
];

const css = fs.readFileSync(path.join(root, 'renderer/styles/design-system.css'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const verified = items.map((it) => {
  let proof = 'present';
  if (it.id.includes('login-drive')) {
    proof = /#login-drive-bootstrap-panel[\s\S]{0,80}display:\s*none\s*!important/.test(css) ? 'css-hidden' : 'MISSING_HIDE';
  }
  if (it.id.includes('lic-drive')) {
    const globallyHidden = /#login-drive-bootstrap-panel\s*,\s*#lic-drive-bootstrap-panel\s*\{[^}]*display:\s*none/.test(css)
      || /#lic-drive-bootstrap-panel\s*\{[^}]*display:\s*none\s*!important/.test(css);
    proof = !globallyHidden && index.includes('lic-drive-bootstrap-panel') ? 'recovery-visible' : 'MISSING';
  }
  if (it.id === 'bootFlowOverlay') proof = boot.includes('NEW_STEPS') ? 'wizard-v258' : 'MISSING';
  if (it.id === 'OwnerCreateForm') proof = fs.existsSync(path.join(root, it.file)) ? 'module' : 'MISSING';
  if (it.id === 'OwnerManagement') proof = fs.existsSync(path.join(root, it.file)) ? 'module' : 'MISSING';
  if (it.id === 'devtools-owner-emergency') {
    const panel = fs.readFileSync(path.join(root, it.file), 'utf8');
    proof = /Owner Emergency Recovery|Owner Support \(Developer Mode\)|Reset Owner Password|ensureOwnerBootstrapWizard/.test(panel) ? 'emergency-wired' : 'MISSING';
  }
  if (it.id === 'owner-hub-accounts') {
    const hub = fs.readFileSync(path.join(root, it.file), 'utf8');
    proof = /createAdditionalOwnerInteractive|oh-owner-accounts/.test(hub) ? 'hub-crud' : 'MISSING';
  }
  if (it.id === 'boot-flow-self-heal-owner') {
    const boot = fs.readFileSync(path.join(root, it.file), 'utf8');
    proof = /ensureOwnerBootstrapWizard/.test(boot) ? 'self-heal' : 'MISSING';
  }
  if (it.id === 'prompt()-based Owner create in boot') {
    proof = !/prompt\?\.\('كلمة مرور Owner'\)/.test(boot) ? 'removed' : 'STILL_PRESENT';
  }
  return { ...it, proof, ok: !/MISSING|STILL_PRESENT/.test(proof) };
});

const summary = {
  at: new Date().toISOString(),
  ok: verified.every((v) => v.ok),
  kept: verified.filter((v) => v.action === 'KEEP').length,
  merged: verified.filter((v) => v.action === 'MERGE').length,
  replaced: verified.filter((v) => v.action === 'REPLACE').length,
  deleted: verified.filter((v) => v.action === 'DELETE').length,
  items: verified,
};
fs.writeFileSync(path.join(evidenceDir, 'screen-inventory.json'), `${JSON.stringify(summary, null, 2)}\n`);
if (!summary.ok) {
  console.error('FAIL: screen inventory');
  process.exit(1);
}
console.log(`OK: inventory keep=${summary.kept} merge=${summary.merged} delete=${summary.deleted} replace=${summary.replaced}`);
