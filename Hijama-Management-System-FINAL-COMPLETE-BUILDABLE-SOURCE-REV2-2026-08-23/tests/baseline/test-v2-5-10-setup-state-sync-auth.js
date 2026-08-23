#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 — Setup state / Sync readiness / Owner password / Ready CTA wiring.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const syncSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
const setupSrc = fs.readFileSync(path.join(root, 'cloud/setup-state-service.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const actSrc = fs.readFileSync(path.join(root, 'cloud/activation-sync-defaults.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const rbacSrc = fs.readFileSync(path.join(root, 'electron/rbac-session.js'), 'utf8');

// SyncEngine APIs
check(/function runOnce/.test(syncSrc) && /function getReadiness/.test(syncSrc) && /function isRunning/.test(syncSrc),
  'SyncEngine implements runOnce + getReadiness + isRunning');
check(/WAITING_FOR_PREREQUISITES/.test(syncSrc) && /missing\.push/.test(syncSrc),
  'getReadiness returns detailed missing[]');
check(/runOnce,/.test(syncSrc) && /getReadiness,/.test(syncSrc) && /isRunning,/.test(syncSrc),
  'SyncEngine exports new APIs');

// SetupStateService
check(/STATES/.test(setupSrc) && /RESTART_REQUIRED/.test(setupSrc) && /READY/.test(setupSrc),
  'SetupStateService official states');
check(/consumeRestartMarker/.test(setupSrc) && /markRestartRequired/.test(setupSrc),
  'restart consume-once API');
check(/loopDetected/.test(setupSrc), 'restart loop detection');
check(/setup-state-service\.js/.test(indexSrc), 'index loads SetupStateService');

// BootFlow ready — single CTA
check(/إعادة تشغيل البرنامج وتطبيق الإعداد/.test(bootSrc), 'single ready relaunch CTA');
check(!/إتمام الإعداد وفتح تسجيل الدخول/.test(bootSrc), 'removed duplicate finish CTA');
check(!/طلب إعادة تشغيل التطبيق/.test(bootSrc), 'removed duplicate restart request CTA');
check(/step === 'ready'/.test(bootSrc) && /return;/.test(bootSrc),
  'nav hides إنهاء والدخول on ready');
check(/onAppStartupAfterRelaunch/.test(bootSrc), 'startup consumes restart marker');
check(/id="login-boot-cta"/.test(indexSrc), 'login boot CTA has stable id');

// Owner password persist
check(/_pendingForcedPwChange[\s\S]{0,120}key === 'users'/.test(indexSrc)
  || /key === 'users'[\s\S]{0,80}_pendingForcedPwChange/.test(indexSrc),
  'dbSetGuarded allows users during forced password change');
check(/_authPending = true/.test(indexSrc) && /persistKv\('users'/.test(indexSrc),
  'forced password sets authPending + persistKv');
check(/credentialRevision/.test(indexSrc) && /schedulePush\?\.\('users'\)|schedulePush\('users'\)/.test(indexSrc),
  'password change enqueues users sync');
check(/ensureRbacSessionBound\(\)/.test(indexSrc)
  && /forced-password: RBAC bind/.test(indexSrc),
  'RBAC bound before forced password persist');

// Sync now messaging
check(/getReadiness/.test(indexSrc) && /missing/.test(indexSrc),
  'runCloudV2SyncNow uses readiness details');
check(/محرك المزامنة غير محمّل/.test(indexSrc), 'missing engine distinct from not-ready');

// Auto backup/sync start
check(/BackupLayer\?\.start|BackupLayer\.start/.test(actSrc), 'ActivationSyncDefaults starts BackupLayer');
check(/startAutoBackupTimer/.test(actSrc), 'ActivationSyncDefaults starts local auto backup timer');
check(/v2ScheduleConfigure/.test(actSrc), 'ActivationSyncDefaults enables V2 schedule');
check(/startBackup:\s*true/.test(bootSrc), 'markBootComplete requests startBackup');

// Relaunch IPC
check(/app:relaunch/.test(preloadSrc) && /relaunchApp:/.test(preloadSrc), 'preload relaunchApp');
check(/handle\('app:relaunch'/.test(mainSrc) && /app\.relaunch\(/.test(mainSrc), 'main relaunch handler');
check(/'app:relaunch'/.test(rbacSrc), 'relaunch is public channel');

// Behavioral: SetupStateService in vm
const sandbox = {
  window: {},
  globalThis: {},
  localStorage: (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  })(),
  module: { exports: {} },
  exports: {},
};
sandbox.global = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(setupSrc, sandbox);
const SS = sandbox.SetupStateService || sandbox.module.exports;
assert.ok(SS);
assert.strictEqual(SS.STATES.READY, 'READY');
const marked = SS.markRestartRequired('unit');
assert.ok(marked.required);
const first = SS.consumeRestartMarker();
assert.strictEqual(first.consumed, true);
const second = SS.consumeRestartMarker();
assert.strictEqual(second.consumed, false, 'second consume must be no-op');

if (errors.length) {
  console.error('FAIL v2-5.10 setup-state-sync-auth');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS v2-5.10:setup-state-sync-auth (sync readiness, password persist, restart consume, single CTA)');
