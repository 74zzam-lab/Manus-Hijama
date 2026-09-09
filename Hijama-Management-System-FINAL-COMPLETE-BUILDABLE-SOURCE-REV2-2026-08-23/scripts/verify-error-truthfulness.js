#!/usr/bin/env node
/**
 * Phase 10 — operational error truthfulness (codes → actionable AR messages, redaction).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function assert(c, m) {
  if (!c) errors.push(m);
}

const truth = require('../database/operational-error-truth');

const push = truth.present('empty_push_blocked');
assert(push.code === 'empty_push_blocked', 'sync guard code');
assert(push.userMessageAr.includes('اسحب'), 'actionable AR message');

const rbac = truth.present({ error: 'manager_only' });
assert(rbac.category === 'rbac', 'rbac category');

const rbacSess = truth.present('rbac_session_required');
assert(rbacSess.userMessageAr.includes('جلسة'), 'rbac_session_required actionable AR');

const enriched = truth.enrichResult({ ok: false, error: 'commit_failed' });
assert(enriched.userMessageAr && enriched.code === 'commit_failed', 'enrichResult');

const envelope = truth.buildEnvelope({ error: 'sqlite_busy', stage: 'ipc' });
assert(envelope.retryable === true && envelope.stage === 'ipc', 'buildEnvelope retryable');

const benignPath = path.join(root, 'cloud/benign-operational-errors.js');
assert(fs.existsSync(benignPath), 'benign-operational-errors.js exists');
const benignCtx = { window: {}, globalThis: {}, console };
benignCtx.window = benignCtx;
benignCtx.globalThis = benignCtx;
vm.createContext(benignCtx);
vm.runInContext(fs.readFileSync(benignPath, 'utf8'), benignCtx);
assert(!benignCtx.BenignOperationalErrors.isBenignOperationalError('someRandomVar is not defined'), 'programmer error not benign');

const red = truth.redactString('token ya29.abc password=secret Bearer xyz');
assert(!/ya29|secret|xyz/i.test(red), 'secrets redacted');

const labels = truth.labelsForCodes(['empty_push_blocked', 'unknown_code_xyz']);
assert(labels[0].includes('اسحب'), 'labelsForCodes known');
assert(labels[1] === 'unknown_code_xyz', 'labelsForCodes fallback');

// Renderer module + drive-errors integration
const context = {
  window: {},
  globalThis: {},
  console,
  notify: () => {},
  AuditLogger: { logSyncEvent: () => {} },
  SyncGuard: { pause: () => {} },
  SyncEngine: { stop: () => {} },
  SyncState: { setOnline: () => {}, setError: () => {} },
  OpsLogRedact: require('../cloud/ops-log-redact.js'),
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/operational-error-truth.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/drive-errors.js'), 'utf8'), context);

const drive = context.DriveErrors.handleFailure({ message: 'storage quota exceeded' });
assert(drive.userMessage.includes('Drive') || drive.userMessage.includes('مساحة'), 'drive quota truthful');
assert(!/ya29/i.test(drive.userMessage), 'drive message leak-safe');

const status = context.OperationalErrorTruth.enrichSyncStatus({ lastError: 'stale_overwrite_blocked' });
assert(status.lastErrorMessageAr && status.lastErrorCode === 'stale_overwrite_blocked', 'enrichSyncStatus');

const syncSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
assert(syncSrc.includes('enrichSyncStatus'), 'sync-engine enriches status');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexSrc.includes('operational-error-truth.js'), 'index loads truth module');
assert(indexSrc.includes('lastErrorMessageAr'), 'index uses truthful label');

if (errors.length) {
  console.error('FAIL verify-error-truthfulness:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: Phase 10 error truthfulness verified');
