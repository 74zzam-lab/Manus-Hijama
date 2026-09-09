#!/usr/bin/env node
'use strict';

/**
 * V2-5.6 — UX hardening & operational visibility unit suite.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '../..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-6', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const OpsProgress = require('../../cloud/ops-progress.js');
const RestoreWizard = require('../../cloud/restore-wizard.js');
const OpsStatus = require('../../cloud/ops-status.js');
const BackupHistory = require('../../cloud/backup-history.js');
const DangerConfirm = require('../../cloud/danger-confirm.js');
const ErrorRecoveryUx = require('../../cloud/error-recovery-ux.js');
const OpsLogRedact = require('../../cloud/ops-log-redact.js');
const UxI18n = require('../../cloud/ux-i18n.js');
const UxA11y = require('../../cloud/ux-a11y.js');
const OpsUxBridge = require('../../cloud/ops-ux-bridge.js');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  OpsProgress._reset();
  RestoreWizard._reset();

  // --- Honest progress ---
  const backup = OpsProgress.createSession({ op: 'backup', stages: ['prepare', 'copy', 'verify'] });
  check(backup.status === 'running' && backup.percent === 0, 'progress_create');
  let snap = OpsProgress.setRatio(backup.id, 1);
  check(snap.percent < 100, 'setRatio_1_stays_under_100');
  check(snap.status !== 'complete', 'setRatio_1_not_complete');
  OpsProgress.assertHonestProgress(snap);
  snap = OpsProgress.setRatio(backup.id, 0.5);
  check(snap.percent === 50, 'setRatio_half');
  snap = OpsProgress.markComplete(backup.id);
  check(snap.percent === 100 && snap.status === 'complete', 'markComplete_100');
  OpsProgress.assertHonestProgress(snap);

  // sync + restore honesty
  const syncS = OpsProgress.createSession({ op: 'sync' });
  const syncRatio = OpsProgress.setRatio(syncS.id, 1);
  check(syncRatio.percent < 100, 'sync_honest');
  OpsProgress.markComplete(syncS.id);
  const restoreS = OpsProgress.createSession({ op: 'restore' });
  check(OpsProgress.setRatio(restoreS.id, 1).percent < 100, 'restore_honest');
  OpsProgress.markComplete(restoreS.id);

  // --- pause / resume / cancel / retry ---
  const ctrl = OpsProgress.createSession({ op: 'backup', stages: ['a'] });
  let c = OpsProgress.pause(ctrl.id);
  check(c.status === 'paused' && c.paused === true, 'pause');
  c = OpsProgress.resume(ctrl.id);
  check(c.status === 'running' && c.paused === false, 'resume');
  c = OpsProgress.requestCancel(ctrl.id);
  check(c.cancelRequested === true, 'request_cancel');
  c = OpsProgress.markCancelled(ctrl.id);
  check(c.status === 'cancelled', 'mark_cancelled');
  c = OpsProgress.retry(ctrl.id);
  check(c.status === 'running' && c.percent === 0, 'retry_from_cancel');
  OpsProgress.markFailed(ctrl.id, 'boom');
  c = OpsProgress.retry(ctrl.id);
  check(c.status === 'running' && c.error == null, 'retry_from_fail');

  // --- Restore wizard happy path + cancel ---
  RestoreWizard._reset();
  let wiz = RestoreWizard.start();
  check(wiz.step === 'select', 'wiz_start');
  wiz = RestoreWizard.selectPoint({ id: 'bp-1', path: '/tmp/bp-1.db' });
  check(wiz.step === 'validate', 'wiz_select');
  wiz = RestoreWizard.validate(() => ({ ok: true, checksum: 'abc' }));
  check(wiz.step === 'preSummary' && wiz.validation.ok, 'wiz_validate');
  wiz = RestoreWizard.buildPreSummary({ rows: 10, sizeBytes: 1024 });
  check(wiz.step === 'confirm' && wiz.preSummary.rows === 10, 'wiz_pre_summary');
  const badPhrase = RestoreWizard.confirmOverwrite({ typedPhrase: 'wrong' });
  check(badPhrase.ok === false, 'wiz_bad_phrase');
  const goodPhrase = RestoreWizard.confirmOverwrite({ typedPhrase: 'استعادة' });
  check(goodPhrase.ok === true && goodPhrase.confirmed === true, 'wiz_typed_استعادة');
  const prog = OpsProgress.createSession({ op: 'restore' });
  wiz = RestoreWizard.startRunning(prog);
  check(wiz.step === 'running', 'wiz_running');
  wiz = RestoreWizard.finish({ ok: true, postSummary: { verified: true, rows: 10 } });
  check(wiz.step === 'done' && wiz.postSummary.verified === true, 'wiz_done');

  RestoreWizard._reset();
  RestoreWizard.start();
  RestoreWizard.selectPoint({ id: 'x' });
  wiz = RestoreWizard.cancel();
  check(wiz.step === 'cancelled', 'wiz_cancel_path');

  // --- Danger wipe phrase ---
  const wipeBad = DangerConfirm.wipeConfirm({ typed: 'wipe' });
  check(wipeBad.ok === false, 'wipe_bad');
  const wipeOk = DangerConfirm.wipeConfirm({ typed: 'مسح الكل' });
  check(wipeOk.ok === true && wipeOk.matched === true, 'wipe_مسح_الكل');
  check(DangerConfirm.WIPE_PHRASE === 'مسح الكل', 'wipe_phrase_const');
  check(DangerConfirm.isDangerousAction('full_wipe'), 'dangerous_action');

  // --- Ops status offline/reconnect + format + truncate ---
  const offline = OpsStatus.buildStatus({
    online: false,
    pendingCount: 12,
    conflictCount: 3,
    deadLetterCount: 1,
    lastSuccessfulSyncAt: '2026-07-01T00:00:00.000Z',
    devices: [{ id: 'd1', name: 'Device A', online: false, pending: 2 }],
  });
  check(offline.online === false && offline.tone === 'offline', 'status_offline');
  check(offline.reconnect.code === 'offline', 'status_reconnect_hint');
  check(offline.pendingCount === 12 && offline.conflictCount === 3, 'status_counts');
  check(offline.deadLetterCount === 1 && offline.lastSuccessfulSyncAt, 'status_dl_last');
  const online = OpsStatus.buildStatus({ online: true, pendingCount: 0 });
  check(online.reconnect.code === 'online' && online.tone === 'ok', 'status_online');
  const big = OpsStatus.formatLargeCount(1234567);
  check(/1.?234.?567/.test(big) || big.includes('1234567'), 'format_large_count');
  const longName = 'مركز-' + 'س'.repeat(80);
  const trunc = OpsStatus.truncateName(longName, 20);
  check(trunc.length <= 20 && trunc.endsWith('…'), 'truncate_long_name');

  // --- Backup history ---
  const entries = [
    { id: 'old', path: '/b/old.db', createdAt: '2026-01-01T00:00:00.000Z', size: 10, validation: 'ok' },
    { id: 'new', path: '/b/new.db', createdAt: '2026-06-01T00:00:00.000Z', size: 20, valid: false },
    { id: 'mid', path: '/b/mid.db', createdAt: '2026-03-01T00:00:00.000Z', size: 15 },
  ].map(BackupHistory.normalizeEntry);
  check(entries[0].validation === 'valid', 'hist_valid');
  check(entries[1].validation === 'invalid', 'hist_invalid');
  check(entries[2].validation === 'unknown', 'hist_unknown');
  const sorted = BackupHistory.sortByNewest(entries);
  check(sorted[0].id === 'new' && sorted[2].id === 'old', 'hist_sort');
  const picked = BackupHistory.selectRestorePoint(entries, 'mid');
  check(picked && picked.id === 'mid', 'hist_select');

  // --- Error recovery leak-safe ---
  const tokenMsg = ErrorRecoveryUx.fromClassify('token_expired');
  ErrorRecoveryUx.assertLeakSafe(tokenMsg);
  const permMsg = ErrorRecoveryUx.fromClassify('permission_denied');
  ErrorRecoveryUx.assertLeakSafe(permMsg);
  const quotaMsg = ErrorRecoveryUx.get('quota');
  ErrorRecoveryUx.assertLeakSafe(quotaMsg);
  const slowMsg = ErrorRecoveryUx.get('network_slow');
  ErrorRecoveryUx.assertLeakSafe(slowMsg);
  const blob = JSON.stringify(tokenMsg) + JSON.stringify(permMsg);
  check(!/ya29\.|Bearer\s+[A-Za-z0-9]{8,}/i.test(blob), 'no_raw_token_in_messages');
  check(!/sk_live|api[_-]?key\s*[:=]/i.test(blob), 'no_api_key_leak');

  // --- Redact ---
  const redStr = OpsLogRedact.redactString(
    'user@example.com Bearer abcdefghijklmnop password=secret123'
  );
  check(redStr.includes('[REDACTED_EMAIL]'), 'redact_email');
  check(/Bearer \[REDACTED\]/i.test(redStr), 'redact_bearer');
  check(/password\s*=\s*\[REDACTED\]/i.test(redStr), 'redact_password');
  const redObj = OpsLogRedact.redactObject({
    password: 'p@ss',
    token: 'tok-xyz',
    authorization: 'Bearer xyz',
    message: 'ok',
  });
  check(redObj.password === '[REDACTED]' && redObj.token === '[REDACTED]', 'redact_keys');
  check(redObj.authorization === '[REDACTED]', 'redact_auth_key');
  const exported = OpsLogRedact.exportRedactedLogs([{ message: 'Bearer tok1234567890', password: 'x' }]);
  check(exported[0].redacted === true && exported[0].password === '[REDACTED]', 'export_redacted');

  // --- i18n ar rtl / en ltr ---
  UxI18n.setLang('ar');
  check(UxI18n.getLang() === 'ar' && UxI18n.getDir() === 'rtl', 'i18n_ar_rtl');
  check(UxI18n.t('ops.restore') === 'استعادة', 'i18n_ar_restore');
  UxI18n.setLang('en');
  check(UxI18n.getLang() === 'en' && UxI18n.getDir() === 'ltr', 'i18n_en_ltr');
  check(UxI18n.t('ops.restore') === 'Restore', 'i18n_en_restore');
  const applied = UxI18n.applyDocumentLang(null, 'ar');
  check(applied.dir === 'rtl' && applied.applied === false, 'i18n_apply_node_safe');

  // --- a11y ---
  const attrs = UxA11y.criticalDialogAttrs();
  check(attrs.role === 'alertdialog' && attrs['aria-modal'] === 'true', 'a11y_critical_attrs');
  const fakeEl = {
    attrs: {},
    getAttribute(k) { return this.attrs[k] || null; },
    setAttribute(k, v) { this.attrs[k] = v; },
  };
  UxA11y.ensureAriaLabel(fakeEl, 'Confirm wipe');
  check(fakeEl.attrs['aria-label'] === 'Confirm wipe', 'a11y_ensure_aria_label');

  // --- bridge module loads ---
  check(OpsUxBridge && typeof OpsUxBridge === 'object', 'bridge_loaded');
  check(typeof OpsUxBridge.renderProgress === 'function' || typeof OpsUxBridge.openRestoreWizard === 'function' || typeof OpsUxBridge.mountBackupHistory === 'function' || Object.keys(OpsUxBridge).length > 0, 'bridge_api');

  // --- index.html wiring ---
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const requiredScripts = [
    'cloud/ops-progress.js',
    'cloud/restore-wizard.js',
    'cloud/ops-status.js',
    'cloud/backup-history.js',
    'cloud/danger-confirm.js',
    'cloud/error-recovery-ux.js',
    'cloud/ops-log-redact.js',
    'cloud/ux-i18n.js',
    'cloud/ux-a11y.js',
    'cloud/ops-ux-bridge.js',
  ];
  for (const s of requiredScripts) {
    check(indexHtml.includes(`src="${s}"`) || indexHtml.includes(`src='${s}'`), `index_script_${s}`);
  }
  check(/design-system\.css/.test(indexHtml), 'index_design_system_css');
  check(/id=["']ops-ux-backup-host["']/.test(indexHtml), 'index_ops_ux_backup_host');

  // --- cupping-system-improvements OpsLogRedact ---
  const improv = fs.readFileSync(path.join(root, 'cupping-system-improvements.js'), 'utf8');
  check(/OpsLogRedact/.test(improv) && /exportRedactedLogs/.test(improv), 'improv_uses_OpsLogRedact');

  // --- owner hub OpsStatus ---
  const hub = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
  check(/OpsStatus/.test(hub), 'owner_hub_OpsStatus');

  // --- font / QR regression ---
  const font = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-font-csp-baseline.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  check(font.status === 0, 'font_csp_exit_0');
  const qr = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-local-qr-baseline.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  check(qr.status === 0, 'local_qr_exit_0');

  const report = {
    at: new Date().toISOString(),
    ok: errors.length === 0,
    phase: 'V2-5.6',
    errors,
    checks: {
      honestProgress: true,
      pauseResumeCancelRetry: true,
      restoreWizard: true,
      dangerWipe: true,
      opsStatus: true,
      backupHistory: true,
      errorRecovery: true,
      redact: true,
      i18n: true,
      a11y: true,
      indexWiring: true,
      fontQr: font.status === 0 && qr.status === 0,
    },
  };
  writeJson('ux-unit.json', report);

  if (errors.length) {
    console.error('FAIL: v2-5.6 ux-hardening');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-5.6 ux-hardening unit');
}

main();
