#!/usr/bin/env node
/**
 * Production migration engine — smoke tests (Node, no DOM).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function loadScript(rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  vm.runInContext(src, context);
}

const context = {
  window: {},
  globalThis: {},
  ImportEngineCore: require(path.join(root, 'import-engine-core.js')),
  console,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = v; }
  },
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, innerHTML: '', addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], parentNode: { insertBefore: () => {} } }) }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

['migration/migration-fields.js', 'migration/migration-identity.js', 'migration/migration-client.js',
 'migration/migration-visit.js', 'migration/migration-finance.js', 'migration/migration-engine.js'].forEach(loadScript);

function assert(c, m) { if (!c) errors.push(m); }

const MI = context.MigrationIdentity;
const ME = context.MigrationEngine;
const MC = context.MigrationClient;
const MF = context.MigrationFinance;

assert(MI && ME && MC && MF, 'migration modules loaded');
assert(Object.keys(context.MigrationFields.MIGRATION_FIELDS).length > 12, 'extended fields');

const indexes = MI.buildMigrationIndexes([], []);
const rec = { name: 'أحمد', phone: '0512345678', patientId: '1234567890' };
const m1 = MI.matchClient(rec, indexes);
assert(m1.level === 'new', 'new client match');

indexes.clientByPid.set('1234567890', { id: 'c1', name: 'أحمد', phone: '0512345678', patientId: '1234567890' });
const m2 = MI.matchClient(rec, indexes);
assert(m2.level === 'confirmed', 'confirmed by patientId');

const stats = ME.analyzeMigration([rec, rec], { duplicateStrategy: 'skip', mapping: { name: 0, phone: 1 } }, indexes);
assert(stats.skipped >= 1, 'duplicate in file skipped');

const incompleteMapping = { name: 0, phone: 1, date: 2 };
const incompleteRec = { name: 'سارة', phone: '0598765432', date: '2024-01-15' };
const finIncomplete = MF.assessImportFinancials(incompleteRec, incompleteMapping, false);
assert(!finIncomplete.billable, 'incomplete import not billable');
assert(!finIncomplete.hasPayment, 'incomplete import has no payment');

const stubFin = MF.assessImportFinancials(incompleteRec, incompleteMapping, true);
assert(!stubFin.billable && stubFin.reason === 'stub', 'stub visit not billable');

const stubCase = { excludeFromFinancials: true, total: 0, cash: 0, card: 0, commission: 0 };
assert(!MF.isBillableCase(stubCase), 'excludeFromFinancials case not billable');
const billableCase = { total: 100, cash: 100, card: 0, commission: 10 };
assert(MF.isBillableCase(billableCase), 'paid case is billable');

const wizardSrc = fs.readFileSync(path.join(root, 'cupping-import-wizard.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(/migration\/migration-engine\.js/.test(indexSrc), 'migration scripts wired');
assert(/migration\/migration-finance\.js/.test(indexSrc), 'finance module wired');
assert(/filterBillableCases/.test(indexSrc), 'billable filter in reports');
assert(/openNextSessionModal/.test(indexSrc), 'booking opens popup modal');
assert(/openPartialResetModal/.test(indexSrc), 'partial reset wired');
assert(/purgeClientsData/.test(indexSrc), 'optimized client delete');
assert(/mergeRegistryClientsIntoMap\(map, 'all'\)/.test(indexSrc), 'search uses registry');
assert(/buildImportCase\(rec, client, \{ mapping \}\)/.test(wizardSrc), 'legacy import passes mapping');

if (errors.length) {
  console.error('FAIL verify-migration-engine:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}
console.log('OK: production migration engine modules verified');
