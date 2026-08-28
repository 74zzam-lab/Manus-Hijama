#!/usr/bin/env node
'use strict';

/**
 * Extended live sync: invoice/file sequences follow max existing docs,
 * and remaining operational clinic data is cloud-synced.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const repo = fs.readFileSync(path.join(root, 'cloud/repository.js'), 'utf8');
const synced = fs.readFileSync(path.join(root, 'cloud/synced-write.js'), 'utf8');
const ops = fs.readFileSync(path.join(root, 'cloud/operational-layer.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
const versions = fs.readFileSync(path.join(root, 'cloud/versions.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const seqSrc = fs.readFileSync(path.join(root, 'cloud/document-sequences.js'), 'utf8');

const mustSync = [
  'messageLog', 'activityLog', 'nextSessions', 'otRecords',
  'employeeLeaveRequests', 'employeeLedgerAccruals', 'employeeLedgerPayments',
  'employeeLedgerEntries', 'importHistory', 'communicationWebhookLog',
  'systemLogs', 'expenses',
];
mustSync.forEach((t) => {
  check(new RegExp(`'${t}'`).test(repo), `Repository SYNCED_TABLES includes ${t}`);
  check(new RegExp(`${t}: 'databaseVersion'`).test(versions), `version map includes ${t}`);
  check(ops.includes(`${t}:`), `operational TABLE_FILES includes ${t}`);
});

check(/opsKv: 'ops-kv.json'/.test(ops), 'opsKv pack exported to Drive');
check(/cashDrawerSession: 'cash-drawer-session.json'/.test(ops), 'cash float pack exported to Drive');
check(/systemLogs: 'system-logs.json'/.test(ops), 'systemLogs pack exported to Drive');
check(/schedulePush\('opsKv'\)/.test(seqSrc), 'counter persist schedules opsKv push');
check(/DocumentSequences\?\.reconcileDocumentSequences/.test(indexSrc)
  && /function generateInvoice/.test(indexSrc), 'generateInvoice reconciles before issuing');
check(/function generateClientFileNo\(\) \{[\s\S]{0,180}DocumentSequences/.test(indexSrc),
  'generateClientFileNo reconciles before issuing');

const localOnlyBlock = synced.match(/const LOCAL_ONLY_KEYS = new Set\(\[([\s\S]*?)\]\)/);
check(localOnlyBlock && !localOnlyBlock[1].includes('messageLog'), 'messageLog removed from LOCAL_ONLY_KEYS');
check(localOnlyBlock && localOnlyBlock[1].includes('hardwareLog'), 'hardwareLog remains local-only');
check(localOnlyBlock && !localOnlyBlock[1].includes('cashDrawerSession'), 'cash float / عهدة is not local-only');
check(localOnlyBlock && !localOnlyBlock[1].includes('systemLogs'), 'systemLogs is not local-only');
check(localOnlyBlock && localOnlyBlock[1].includes('communicationQueue'), 'outbound message queue stays on this device');
check(/emptyRemote: true/.test(engine), 'missing new operational files do not fail branch pull');
check(/reloadClientStoreFromDb/.test(engine) && /reconcileDocumentSequences/.test(engine),
  'branch pull reloads store and reconciles sequences');

const layoutSrc = fs.readFileSync(path.join(root, 'cloud/drive-layout.js'), 'utf8');
check(/TABLE_FILES/.test(layoutSrc) && /operationalFileBases/.test(layoutSrc),
  'Drive pull candidates include TABLE_FILES mapped names (message-log.json)');
check(/drivePathForTable/.test(engine) && /operationalBranchFileCandidates/.test(engine),
  'operational pull tries canonical Drive path then candidates');

const kv = { invoiceCounter: 1, clientFileCounter: 1, budget: 0 };
const sandbox = {
  invoiceCounter: 1,
  clientFileCounter: 1,
  cases: [{ invoice: 'TM-2026-0050', fileNo: 'CL-00050' }],
  clientsRegistry: [{ fileNo: 'CL-00050' }],
  otRecords: [],
  DB: {
    get(key, fallback) { return kv[key] != null ? kv[key] : fallback; },
    set(key, value) { kv[key] = value; },
  },
  SyncEngine: { schedulePush(table) { sandbox._pushed = table; } },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(seqSrc, sandbox, { timeout: 3000 });
vm.runInNewContext(ops, sandbox, { timeout: 3000 });

check(String(sandbox.OperationalLayer.drivePathForTable('CTR', 'BR-MAIN', 'messageLog')).includes('message-log.json'),
  'messageLog Drive file is message-log.json');
check(String(sandbox.OperationalLayer.drivePathForTable('CTR', 'BR-MAIN', 'opsKv')).includes('ops-kv.json'),
  'opsKv Drive file is ops-kv.json');

sandbox.DocumentSequences.reconcileDocumentSequences();
check(sandbox.invoiceCounter === 51, 'after seeing invoice 50 next counter is 51');
check(sandbox.clientFileCounter === 51, 'after seeing file 50 next file counter is 51');
check(sandbox._pushed === 'opsKv', 'reconcile pushes opsKv so other devices get the counter');

sandbox.invoiceCounter = 10;
kv.invoiceCounter = 10;
const applied = sandbox.OperationalLayer.applyOpsKvRecords([
  { id: 'invoiceCounter', value: 40 },
  { id: 'clientFileCounter', value: 12 },
  { id: 'budget', value: 250 },
]);
check(applied.invoiceCounter >= 51, 'opsKv pull takes max(local, remote, documents)');
check(applied.clientFileCounter >= 51, 'opsKv file counter lifts from documents');
check(kv.budget === 250, 'budget syncs through opsKv');

check(String(sandbox.OperationalLayer.drivePathForTable('CTR', 'BR-MAIN', 'cashDrawerSession')).includes('cash-drawer-session.json'),
  'cash float Drive file is cash-drawer-session.json');

const today = new Date().toISOString().split('T')[0];
sandbox.cashDrawerSession = {
  date: today,
  openingFloat: 500,
  movements: [{ id: 'm-local', amount: 100, reason: 'A', at: '2026-08-28T10:00:00.000Z' }],
  openedAt: '2026-08-28T09:00:00.000Z',
};
kv.cashDrawerSession = sandbox.cashDrawerSession;
const cashApplied = sandbox.OperationalLayer.applyCashDrawerRecords([
  { id: `session:${today}`, kind: 'session', date: today, openingFloat: 500, openedAt: '2026-08-28T09:00:00.000Z' },
  { id: 'm-remote', kind: 'movement', date: today, amount: 80, reason: 'B', at: '2026-08-28T11:00:00.000Z' },
], 'BR-MAIN');
const cashIds = (cashApplied.movements || []).map((m) => m.id).sort();
check(cashIds.includes('m-local') && cashIds.includes('m-remote'), 'cash float pull unions movements from both devices');
check(Number(cashApplied.openingFloat) === 500, 'cash float opening survives merge');

if (errors.length) {
  console.error('FAIL sync-extended-operational');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:sync-extended-operational');
