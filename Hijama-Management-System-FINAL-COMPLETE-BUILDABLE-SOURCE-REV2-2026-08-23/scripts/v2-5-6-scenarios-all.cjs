#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-6', 'evidence');
const scenariosDir = path.join(evidenceDir, 'scenarios');
fs.mkdirSync(scenariosDir, { recursive: true });

const results = [];
const startedAt = new Date().toISOString();

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function runNode(rel, env) {
  return spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

async function scenario(id, title, fn) {
  const started = Date.now();
  const entry = { id, title, result: 'FAIL', ms: 0, evidence: {} };
  try {
    entry.evidence = (await fn()) || {};
    entry.result = 'PASS';
  } catch (err) {
    entry.result = 'FAIL';
    entry.error = String(err && (err.message || err)).slice(0, 400);
  }
  entry.ms = Date.now() - started;
  results.push(entry);
  writeJson(path.join(scenariosDir, `${id}.json`), entry);
  console.log(`${entry.result}  ${id}  ${title}  (${entry.ms}ms)`);
}

async function main() {
  await scenario('U01-restore-wizard', 'Restore wizard happy path + cancel', async () => {
    const RestoreWizard = require(path.join(root, 'cloud/restore-wizard.js'));
    const OpsProgress = require(path.join(root, 'cloud/ops-progress.js'));
    const DangerConfirm = require(path.join(root, 'cloud/danger-confirm.js'));
    OpsProgress._reset();
    RestoreWizard._reset();
    RestoreWizard.start();
    RestoreWizard.selectPoint({ id: 'bp-u01', path: '/tmp/u01.db' });
    RestoreWizard.validate(() => ({ ok: true }));
    RestoreWizard.buildPreSummary({ rows: 5 });
    const conf = RestoreWizard.confirmOverwrite({ typedPhrase: 'استعادة' });
    if (!conf.ok) throw new Error('confirm');
    if (!DangerConfirm.restoreOverwriteConfirm({ typed: 'استعادة' }).ok) throw new Error('danger');
    const prog = OpsProgress.createSession({ op: 'restore' });
    RestoreWizard.startRunning(prog);
    OpsProgress.setRatio(prog.id, 1);
    if (OpsProgress.getSnapshot(prog.id).percent >= 100) throw new Error('fake100');
    OpsProgress.markComplete(prog.id);
    const done = RestoreWizard.finish({ ok: true, postSummary: { verified: true } });
    if (done.step !== 'done') throw new Error('not_done');
    RestoreWizard._reset();
    RestoreWizard.start();
    const cancelled = RestoreWizard.cancel();
    if (cancelled.step !== 'cancelled') throw new Error('cancel');
    return { step: done.step, cancel: cancelled.step, phrase: 'استعادة' };
  });

  await scenario('U02-progress-honesty', 'Honest progress + pause/resume/cancel/retry', async () => {
    const OpsProgress = require(path.join(root, 'cloud/ops-progress.js'));
    OpsProgress._reset();
    const evidence = {};
    for (const op of ['backup', 'sync', 'restore']) {
      const s = OpsProgress.createSession({ op });
      const mid = OpsProgress.setRatio(s.id, 1);
      if (mid.percent >= 100) throw new Error(op + '_fake100');
      OpsProgress.assertHonestProgress(mid);
      const done = OpsProgress.markComplete(s.id);
      if (done.percent !== 100) throw new Error(op + '_complete');
      evidence[op] = { beforeComplete: mid.percent, after: done.percent };
    }
    const ctrl = OpsProgress.createSession({ op: 'backup' });
    OpsProgress.pause(ctrl.id);
    OpsProgress.resume(ctrl.id);
    OpsProgress.requestCancel(ctrl.id);
    OpsProgress.markCancelled(ctrl.id);
    OpsProgress.retry(ctrl.id);
    OpsProgress.markFailed(ctrl.id, 'x');
    OpsProgress.retry(ctrl.id);
    evidence.controls = 'pause/resume/cancel/retry';
    return evidence;
  });

  await scenario('U03-ops-status', 'Offline/reconnect + counts + long names', async () => {
    const OpsStatus = require(path.join(root, 'cloud/ops-status.js'));
    const off = OpsStatus.buildStatus({
      online: false,
      pendingCount: 1500,
      conflictCount: 42,
      deadLetterCount: 7,
      lastSuccessfulSyncAt: '2026-07-30T00:00:00.000Z',
      devices: [
        {
          id: 'd1',
          name: 'جهاز-فرع-الشمال-' + 'ن'.repeat(60),
          online: false,
          pending: 9,
        },
      ],
    });
    if (off.tone !== 'offline') throw new Error('offline');
    if (off.reconnect.code !== 'offline') throw new Error('hint');
    if (off.devices[0].name.length > 32) throw new Error('truncate');
    if (!OpsStatus.formatLargeCount(1500)) throw new Error('fmt');
    const on = OpsStatus.buildStatus({ online: true, pendingCount: 0 });
    if (on.reconnect.code !== 'online') throw new Error('online');
    return {
      offline: off.summaryEn,
      pendingLabel: off.pendingCountLabel,
      deviceNameLen: off.devices[0].name.length,
      online: on.tone,
    };
  });

  await scenario('U04-redact-export', 'Ops log redact email/bearer/password', async () => {
    const OpsLogRedact = require(path.join(root, 'cloud/ops-log-redact.js'));
    const ErrorRecoveryUx = require(path.join(root, 'cloud/error-recovery-ux.js'));
    const rows = OpsLogRedact.exportRedactedLogs([
      {
        message: 'contact admin@clinic.example Bearer ya29.a0AfH6SMC_fake_token',
        password: 'hunter2',
        token: 'secret-token-value',
      },
    ]);
    const s = JSON.stringify(rows);
    if (/admin@clinic\.example/.test(s)) throw new Error('email_leak');
    if (/ya29\.a0AfH6SMC/.test(s)) throw new Error('bearer_leak');
    if (/hunter2/.test(s)) throw new Error('password_leak');
    if (rows[0].password !== '[REDACTED]') throw new Error('key');
    const msg = ErrorRecoveryUx.fromClassify('token_expired');
    ErrorRecoveryUx.assertLeakSafe(msg);
    const improv = fs.readFileSync(path.join(root, 'cupping-system-improvements.js'), 'utf8');
    if (!/OpsLogRedact/.test(improv)) throw new Error('improv_unwired');
    return { redacted: true, exportCount: rows.length };
  });

  await scenario('U05-i18n-a11y', 'AR RTL / EN LTR + critical dialog a11y', async () => {
    const UxI18n = require(path.join(root, 'cloud/ux-i18n.js'));
    const UxA11y = require(path.join(root, 'cloud/ux-a11y.js'));
    UxI18n.setLang('ar');
    if (UxI18n.getDir() !== 'rtl') throw new Error('rtl');
    UxI18n.setLang('en');
    if (UxI18n.getDir() !== 'ltr') throw new Error('ltr');
    const attrs = UxA11y.criticalDialogAttrs();
    if (attrs.role !== 'alertdialog') throw new Error('role');
    const el = { store: {}, getAttribute(k) { return this.store[k] || null; }, setAttribute(k, v) { this.store[k] = v; } };
    UxA11y.ensureAriaLabel(el, 'مسح الكل');
    if (el.store['aria-label'] !== 'مسح الكل') throw new Error('aria');
    return { ar: 'rtl', en: 'ltr', role: attrs.role };
  });

  await scenario('U06-owner-hub-wiring', 'Owner Hub uses OpsStatus + index scripts', async () => {
    const unit = runNode('tests/baseline/test-v2-5-6-ux-hardening.js');
    if (unit.status !== 0) throw new Error(unit.stderr || unit.stdout || 'unit_failed');
    const hub = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
    if (!/OpsStatus/.test(hub)) throw new Error('no_OpsStatus');
    if (!/buildStatus|formatLargeCount/.test(hub)) throw new Error('no_ops_api');
    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    if (!/ops-ux-backup-host/.test(indexHtml)) throw new Error('host');
    if (!/design-system\.css/.test(indexHtml)) throw new Error('css');
    const unitEv = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'ux-unit.json'), 'utf8'));
    if (!unitEv.ok) throw new Error('unit_not_ok');
    return { ownerHubOpsStatus: true, unitOk: true };
  });

  const failed = results.filter((r) => r.result !== 'PASS');
  const summary = {
    phase: 'V2-5.6',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    total: results.length,
    passed: results.filter((r) => r.result === 'PASS').length,
    failed: failed.length,
    results,
  };
  writeJson(path.join(evidenceDir, 'scenarios-all.json'), summary);
  if (failed.length) {
    console.error(`V2-5.6 scenarios FAIL: ${failed.length}/${results.length}`);
    process.exit(1);
  }
  console.log(`V2-5.6 scenarios PASS: ${results.length}/${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
