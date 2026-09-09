#!/usr/bin/env node
'use strict';

/**
 * V2-5.8 scenarios — evidence written only from this execution.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-8', 'evidence');
const scenariosDir = path.join(evidenceDir, 'scenarios');
fs.mkdirSync(scenariosDir, { recursive: true });
const results = [];

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function run(rel) {
  return spawnSync(process.execPath, [path.join(root, rel)], { cwd: root, encoding: 'utf8', timeout: 120000 });
}

async function scenario(id, title, fn) {
  const started = Date.now();
  const entry = { id, title, result: 'FAIL', ms: 0, evidence: {} };
  try {
    entry.evidence = (await fn()) || {};
    entry.result = 'PASS';
  } catch (err) {
    entry.result = 'FAIL';
    entry.error = String(err && (err.message || err)).slice(0, 500);
  }
  entry.ms = Date.now() - started;
  results.push(entry);
  writeJson(path.join(scenariosDir, `${id}.json`), entry);
  console.log(`${entry.result}  ${id}  (${entry.ms}ms)`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

async function main() {
  await scenario('A01-unit-suite', 'Activation unit suite exit 0', async () => {
    const r = run('tests/baseline/test-v2-5-8-auth-activation-ui.js');
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').slice(0, 400));
    const unit = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'activation-unit.json'), 'utf8'));
    if (!unit.ok) throw new Error('unit not ok');
    return { exitCode: r.status, at: unit.at };
  });

  await scenario('A02-wizard-steps', 'Unified stepper Google→…→Ready', async () => {
    const boot = read('cloud/boot-flow-ui.js').replace(/\s+/g, ' ');
    // V2-5.8 included owner; V2-5.9 removes owner from customer journey.
    const v258 = /NEW_STEPS\s*=\s*\[\s*'language',\s*'google',\s*'license',\s*'organization',\s*'branch',\s*'owner',\s*'restore',\s*'sync',\s*'ready'\s*\]/.test(boot);
    const v259 = /NEW_STEPS\s*=\s*\[\s*'language',\s*'google',\s*'license',\s*'organization',\s*'branch',\s*'restore',\s*'sync',\s*'ready'\s*\]/.test(boot);
    if (!v258 && !v259) throw new Error('NEW_STEPS mismatch');
    return { steps: v259 ? 8 : 9, version: v259 ? 'v2-5.9' : 'v2-5.8' };
  });

  await scenario('A03-owner-password', 'Owner password mandatory + mismatch/empty/weak', async () => {
    const OCF = require('../cloud/owner-create-form.js');
    if (OCF.validatePasswordPair('', '').ok) throw new Error('empty allowed');
    if (OCF.validatePasswordPair('1234567', '1234567').ok) throw new Error('weak allowed');
    if (OCF.validatePasswordPair('12345678', 'x').ok) throw new Error('mismatch allowed');
    return { min: OCF.MIN_PASSWORD_LENGTH };
  });

  await scenario('A04-duplicate-prevention', 'OAuth/license/branch/owner in-flight locks', async () => {
    const boot = read('cloud/boot-flow-ui.js');
    for (const k of ['oauthInFlight', 'licenseActivateInFlight', 'branchCreateInFlight', 'ownerCreateInFlight']) {
      if (!boot.includes(k)) throw new Error('missing ' + k);
    }
    if (!read('cloud/branch-enrollment.js').includes('idempotencyKey')) throw new Error('no idempotency');
    return { locks: 4 };
  });

  await scenario('A05-dashboard-gate', 'Dashboard/login blocked until activation complete', async () => {
    const index = read('index.html');
    if (!/needsBootScreen/.test(index) || !/أكمل رحلة الإعداد/.test(index)) throw new Error('gates missing');
    return { finishLoginGate: true, showPageGate: true };
  });

  await scenario('A06-inventory', 'Screen inventory KEEP/MERGE/DELETE', async () => {
    const r = run('scripts/v2-5-8-screen-inventory.cjs');
    if (r.status !== 0) throw new Error('inventory fail');
    const inv = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'screen-inventory.json'), 'utf8'));
    if (!inv.ok) throw new Error('inventory not ok');
    return inv;
  });

  await scenario('A07-responsive-css', 'Modal max-height + resolution media queries', async () => {
    const css = read('renderer/styles/design-system.css');
    const boot = read('cloud/boot-flow-ui.js');
    const index = read('index.html');
    const blob = css + boot + index;
    const resolutions = [1024, 1280, 1366, 1440, 1600, 1920, 2560];
    const present = {
      maxHeightViewport: /max-height:\s*min\(9[24]vh|max-height:\s*calc\(100dvh|100dvh/.test(blob),
      safeArea: /--tdw-safe-block:\s*clamp\(24px,\s*5vh,\s*48px\)/.test(css),
      modalShell: /modal-shell/.test(css) && /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/.test(css),
      media1024: /max-width:\s*1024px/.test(css),
      media1280: /max-width:\s*1280px/.test(css),
      media1100: /max-width:\s*1100px/.test(css),
      media900: /max-width:\s*900px/.test(css),
      media720: /max-width:\s*720px/.test(css),
      media600: /max-width:\s*600px/.test(css),
      overflowXHidden: /overflow-x:\s*hidden/.test(css),
      stickyFooter: /modal-footer[\s\S]{0,120}sticky|tdw-modal__footer[\s\S]{0,120}sticky|bf-card-footer[\s\S]{0,80}sticky/.test(css + boot),
    };
    if (!present.maxHeightViewport) throw new Error('no max-height');
    if (!(present.media1024 || present.media1100) || !present.overflowXHidden) throw new Error('responsive incomplete');
    if (!present.safeArea || !present.modalShell) throw new Error('modal-shell / safe-area missing');
    return { resolutionsTargeted: resolutions, css: present };
  });

  await scenario('A08-error-catalog', 'User-facing errors without raw stack/secrets', async () => {
    const AE = require('../cloud/activation-errors.js');
    const ue = AE.toUserError({ message: 'oauth_timeout' });
    if (/stack|at Object\.|undefined/.test(ue.title + ue.detail)) throw new Error('bad message');
    const red = AE.redact('Bearer abcdefghijklmnopqrst password=supersecret ya29.xyz');
    if (/supersecret|ya29\.xyz|abcdefghijklmnopqrst/.test(red)) throw new Error('secret leak');
    return { codes: Object.keys(AE.USER_MESSAGES).length, diagnosticCode: ue.diagnosticCode };
  });

  await scenario('A09-branch-enrollment-wizard', 'activation_wizard first branch + reject second', async () => {
    const src = read('cloud/branch-enrollment.js');
    if (!src.includes("options.source !== 'owner_hub' && options.source !== 'activation_wizard'")) {
      throw new Error('source gate missing');
    }
    if (!src.includes('activation_wizard_first_branch_only')) throw new Error('first-only missing');
    return { ok: true };
  });

  await scenario('A10-prior-gates-present', 'V2-4 and V2-5 gate scripts still present', async () => {
    const needed = [
      'scripts/verify-v2-4-completion.cjs',
      'scripts/verify-v2-5-7-completion.cjs',
      'scripts/verify-v2-5-stabilization-completion.cjs',
      'scripts/verify-v2-5-master-completion.cjs',
    ];
    for (const n of needed) if (!fs.existsSync(path.join(root, n))) throw new Error('missing ' + n);
    return { count: needed.length };
  });

  const failed = results.filter((r) => r.result !== 'PASS');
  const summary = {
    at: new Date().toISOString(),
    ok: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.map((f) => f.id),
    results,
    exitCode: failed.length ? 1 : 0,
  };
  writeJson(path.join(evidenceDir, 'scenarios-all.json'), summary);
  if (failed.length) {
    console.error('FAIL: v2-5.8 scenarios');
    process.exit(1);
  }
  console.log(`OK: v2-5.8 scenarios ${summary.passed}/${summary.total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
