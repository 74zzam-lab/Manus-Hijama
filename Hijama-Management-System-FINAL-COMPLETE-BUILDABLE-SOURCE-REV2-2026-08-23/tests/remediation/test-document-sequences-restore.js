#!/usr/bin/env node
'use strict';

/**
 * After restore/hydrate, invoice and client-file counters must continue
 * from the last used document number (TM-YYYY-NNNN / CL-00042).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const seq = require(path.join(root, 'cloud/document-sequences.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rehydrateSrc = fs.readFileSync(path.join(root, 'cloud/restore-runtime-rehydrate.js'), 'utf8');
const isolationSrc = fs.readFileSync(path.join(root, 'cloud/branch-data-isolation.js'), 'utf8');

check(seq.parseInvoiceSequence('TM-2026-0042') === 42, 'invoice parse uses last numeric group (not year+seq)');
check(seq.parseInvoiceSequence('TM-2026-0042') !== 20260042, 'invoice parse does not concatenate year digits');
check(seq.parseClientFileSequence('CL-00042') === 42, 'file parse CL-00042 → 42');
check(seq.parseClientFileSequence('CL-00001') === 1, 'file parse CL-00001 → 1');
check(seq.nextCounter(1, 42) === 43, 'stale counter 1 lifts to max+1');
check(seq.nextCounter(50, 42) === 50, 'stored counter above max is kept');
check(seq.nextCounter(42, 42) === 43, 'stored equal to last used invoice bumps to next free');

const scanned = seq.scanMaxSequences({
  cases: [
    { invoice: 'TM-2026-0042', fileNo: 'CL-00007' },
    { invoice: 'TM-2025-0010', fileNo: 'CL-00019' },
  ],
  clientsRegistry: [{ fileNo: 'CL-00041' }],
  otRecords: [{ invoice: 'TM-2026-0003' }],
});
check(scanned.maxInvoiceSeq === 42, 'scan max invoice is 42 not 20260042');
check(scanned.maxFileSeq === 41, 'scan max file is 41');

const kv = { invoiceCounter: 1, clientFileCounter: 1 };
const sandbox = {
  invoiceCounter: 1,
  clientFileCounter: 1,
  cases: [{ invoice: 'TM-2026-0042', fileNo: 'CL-00007' }],
  clientsRegistry: [{ fileNo: 'CL-00041' }],
  otRecords: [],
  DB: {
    get(key, fallback) { return kv[key] != null ? kv[key] : fallback; },
    set(key, value) { kv[key] = value; },
  },
  BranchDataIsolation: {
    persistActiveBranchCounters() { kv.branchPersisted = true; },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(root, 'cloud/document-sequences.js'), 'utf8'),
  sandbox,
  { timeout: 3000, filename: 'document-sequences.js' }
);
const lifted = sandbox.DocumentSequences.reconcileDocumentSequences();
check(lifted.invoiceCounter === 43, 'reconcile invoiceCounter → 43 after last TM-2026-0042');
check(lifted.clientFileCounter === 42, 'reconcile clientFileCounter → 42 after CL-00041');
check(kv.invoiceCounter === 43, 'reconcile persists invoiceCounter to KV');
check(kv.clientFileCounter === 42, 'reconcile persists clientFileCounter to KV');
check(kv.branchPersisted === true, 'reconcile persists branch counter slice');
check(sandbox.invoiceCounter === 43, 'reconcile updates live invoiceCounter');

const isolationSb = {
  invoiceCounter: 88,
  clientFileCounter: 17,
  cases: [{ invoice: 'TM-2026-0042', fileNo: 'CL-00019' }],
  clientsRegistry: [{ fileNo: 'CL-00019' }],
  settings: {},
  DB: (() => {
    const store = {
      invoiceCounter: 88,
      clientFileCounter: 17,
      __tdw_branch_counters_store__: {},
      __tdw_branch_settings_store__: {},
    };
    return {
      get(key, fallback) { return store[key] != null ? store[key] : fallback; },
      set(key, value) { store[key] = value; },
      _store: store,
    };
  })(),
  DocumentSequences: sandbox.DocumentSequences,
  SettingsSplit: { BRANCH_SETTINGS_KEYS: [] },
  BranchScope: {
    isAggregateBranchView: () => false,
    getActiveBranchId: () => 'BR-MAIN',
    DEFAULT_BRANCH_ID: 'BR-MAIN',
  },
  BranchContexts: { getOperationalWriteBranch: () => 'BR-MAIN' },
};
isolationSb.window = isolationSb;
isolationSb.globalThis = isolationSb;
isolationSb.DocumentSequences = seq;
vm.runInNewContext(
  fs.readFileSync(path.join(root, 'cloud/document-sequences.js'), 'utf8'),
  isolationSb,
  { timeout: 3000 }
);
vm.runInNewContext(isolationSrc, isolationSb, { timeout: 3000, filename: 'branch-data-isolation.js' });
isolationSb.invoiceCounter = 88;
isolationSb.clientFileCounter = 17;
isolationSb.DB.set('invoiceCounter', 88);
isolationSb.DB.set('clientFileCounter', 17);
isolationSb.BranchDataIsolation.applyIncoming('BR-MAIN');
check(isolationSb.invoiceCounter === 88, 'missing branch slice keeps restored invoiceCounter');
check(isolationSb.clientFileCounter === 17, 'missing branch slice keeps restored clientFileCounter');
check(isolationSb.invoiceCounter !== 1, 'applyIncoming without slice must not rewind invoices to 1');

check(/document-sequences\.js/.test(indexSrc), 'index loads document-sequences.js');
check(/DocumentSequences\?\.reconcileDocumentSequences/.test(indexSrc), 'reloadClientStoreFromDb reconciles sequences');
check(/completeAuthenticatedLogin[\s\S]{0,1200}DocumentSequences\?\.reconcileDocumentSequences/.test(indexSrc)
  || /rehydrateBranchView\(\);[\s\S]{0,200}DocumentSequences\?\.reconcileDocumentSequences/.test(indexSrc),
  'login rehydrate reconciles sequences before generating invoices');
check(/reconcile_sequences/.test(rehydrateSrc), 'restore rehydrate has sequence stage');
check(/DocumentSequences\?\.reconcileDocumentSequences/.test(rehydrateSrc), 'restore rehydrate reconciles sequences');
check(/Missing slice must NOT reset counters/.test(isolationSrc), 'applyBranchCounters documents no-reset-on-missing-slice');
check(/persistActiveBranchCounters/.test(indexSrc) && /function generateInvoice/.test(indexSrc), 'invoice generation persists branch counters');
check(!/parseInt\(String\(c\.invoice \|\| ''\)\.replace\(\\D\/g, ''\)/.test(indexSrc), 'restore integrity no longer concatenates invoice digits');

if (errors.length) {
  console.error('FAIL document-sequences-restore');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:document-sequences-restore');
