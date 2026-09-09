#!/usr/bin/env node
/**
 * Phase 6: sync push/pull guards (empty push, localRev=0, stale overwrite).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const guards = require('../database/sync-push-guards');

const root = path.join(__dirname, '..');
const syncEngine = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
const peer = fs.readFileSync(path.join(root, 'database/peer-sync-engine.js'), 'utf8');

const checks = [
  { name: 'sync-push-guards module', ok: fs.existsSync(path.join(root, 'database/sync-push-guards.js')) },
  { name: 'sync-baseline module', ok: fs.existsSync(path.join(root, 'database/sync-baseline.js')) },
  { name: 'sync-coordinator module', ok: fs.existsSync(path.join(root, 'cloud/sync-coordinator.js')) },
  { name: 'cloud SyncPushGuards script', ok: fs.existsSync(path.join(root, 'cloud/sync-push-guards.js')) },
  { name: 'sync-engine assertPushAllowed', ok: /function assertPushAllowed/.test(syncEngine) },
  { name: 'sync-engine pull guard', ok: /evaluatePullApplyGuard/.test(syncEngine) },
  { name: 'sync-engine baseline gate', ok: /SyncBaseline\?\.assertPushAllowed/.test(syncEngine) },
  { name: 'peer-sync-engine push guard', ok: /pushGuards\.evaluatePushGuard/.test(peer) },
  { name: 'peer-sync-engine baseline gate', ok: /baseline\.assertPushAllowed/.test(peer) },
  { name: 'index loads sync-push-guards', ok: /cloud\/sync-push-guards\.js/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')) },
  { name: 'index loads sync-baseline', ok: /cloud\/sync-baseline\.js/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}

const empty = guards.evaluatePushGuard({ localRevision: 0, remoteRevision: 5, recordCount: 0 });
console.log((!empty.ok && empty.code === 'empty_push_blocked' ? 'PASS' : 'FAIL') + '  empty push blocked');
if (empty.ok || empty.code !== 'empty_push_blocked') failed += 1;

const localZero = guards.evaluatePushGuard({ localRevision: 0, remoteRevision: 3, recordCount: 0 });
console.log((!localZero.ok && localZero.code === 'empty_push_blocked' ? 'PASS' : 'FAIL') + '  localRev=0 empty blocked');
if (localZero.ok || localZero.code !== 'empty_push_blocked') failed += 1;

const staleRemote = guards.evaluatePullApplyGuard({ localRevision: 5, remoteRevision: 3, pendingOutbox: 0 });
console.log((!staleRemote.ok && staleRemote.code === 'stale_remote_skipped' ? 'PASS' : 'FAIL') + '  stale remote skipped');
if (staleRemote.ok || staleRemote.code !== 'stale_remote_skipped') failed += 1;

const staleOverwrite = guards.evaluatePullApplyGuard({ localRevision: 8, remoteRevision: 5, pendingOutbox: 2 });
console.log((!staleOverwrite.ok && staleOverwrite.code === 'stale_overwrite_blocked' ? 'PASS' : 'FAIL') + '  stale overwrite blocked');
if (staleOverwrite.ok || staleOverwrite.code !== 'stale_overwrite_blocked') failed += 1;

const okPush = guards.evaluatePushGuard({ localRevision: 2, remoteRevision: 5, recordCount: 3 });
console.log((okPush.ok ? 'PASS' : 'FAIL') + '  valid push allowed');
if (!okPush.ok) failed += 1;

const casMismatch = guards.evaluateCasPushGuard({ expectedRemoteRevision: 10, actualRemoteRevision: 11 });
console.log((!casMismatch.ok && casMismatch.code === 'remote_revision_mismatch' ? 'PASS' : 'FAIL') + '  CAS stale revision');
if (casMismatch.ok || casMismatch.code !== 'remote_revision_mismatch') failed += 1;

if (failed) process.exit(1);
console.log('\nAll sync guard checks passed.');
