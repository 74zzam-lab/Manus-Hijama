#!/usr/bin/env node
/**
 * Client import — regression tests (duplicate strategies + batch engine).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(root, 'import-engine-core.js'), 'utf8');
const wizardSrc = fs.readFileSync(path.join(root, 'cupping-import-wizard.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const errors = [];

function loadCore() {
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(coreSrc, sandbox);
  return sandbox.module.exports;
}

const Core = loadCore();

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

// ── Core mapping ──
{
  const headers = ['اسم العميل', 'جوال'];
  const mapping = Core.autoDetectImportMapping(headers);
  assert(mapping.name === 0 && mapping.phone === 1, 'auto map columns');
}

// ── Batch engine wiring ──
{
  assert(/IMPORT_BATCH_SIZE\s*=\s*400/.test(wizardSrc), 'batch size 400');
  assert(/import-engine-worker/.test(wizardSrc), 'worker referenced');
  assert(/cancelClientImport/.test(wizardSrc), 'cancel export');
  assert(/renderImportProgress/.test(wizardSrc), 'progress UI');
  assert(/persistImportBatch/.test(wizardSrc), 'batch persist');
  assert(/deferPersist/.test(wizardSrc), 'defer persist during import');
  assert(/IMPORT_DUPLICATE_STRATEGIES/.test(wizardSrc), 'duplicate strategies kept');
  assert(/processImportRow/.test(wizardSrc), 'batch row processor');
  assert(/mergeRegistryClientsIntoMap/.test(indexSrc), 'registry clients merged into clients view');
  assert(/finishImportUiRefresh/.test(wizardSrc), 'post-import UI refresh');
}

// ── Duplicate strategy integration (DOM-less) ──
const context = {
  clientsRegistry: [],
  cases: [],
  doctors: [{ id: 'd1', name: 'أخصائي', active: true }],
  settings: { cupPrice: 50, vatRate: 15 },
  currentUser: { id: '1', fullName: 'Admin' },
  importHistory: [],
  invoiceCounter: 1,
  systemLogs: [],
  DB: {
    _data: {},
    get(k, d) { return this._data[k] !== undefined ? this._data[k] : d; },
    set(k, v) { this._data[k] = v; }
  },
  notify: () => {},
  hasPermission: () => true,
  generateInvoice: (opts) => { context.invoiceCounter++; return 'INV-001'; },
  getServiceUnitPrice: () => 50,
  calcCaseCommission: () => 0,
  findClientsByPhone: (phone) => {
    const p = String(phone || '').replace(/\D/g, '').slice(-10);
    return context.clientsRegistry.filter(c => String(c.phone || '').replace(/\D/g, '').slice(-10) === p);
  },
  ensureClientRegistry: (opts) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 5);
    const client = {
      id, name: opts.name, phone: opts.phone, fileNo: 'F' + id.slice(-4),
      patientId: opts.patientId || '', nationality: opts.nationality || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    context.clientsRegistry.push(client);
    return client;
  },
  clientExistsByPhone: () => false,
  migrateClientsFromCases: () => {},
  logAudit: () => {},
  trackBackupOperation: () => {},
  buildFullBackupObject: null,
  downloadFile: null,
  document: {
    querySelector: (sel) => {
      if (sel === 'input[name="import-dup-strategy"]:checked') {
        return { value: context._testStrategy || 'skip' };
      }
      return null;
    },
    getElementById: () => null
  },
  crypto: require('crypto'),
  performance: { now: () => Date.now() },
  setTimeout,
  XLSX: null,
  Worker: null,
  window: {},
  _testStrategy: 'skip',
  SyncedWrite: {
    setTable(table, value) {
      context[table] = value;
      context.DB.set(table, value);
    }
  },
  SyncGuard: { pause: () => {}, resume: () => {} }
};
context.window = context;

vm.createContext(context);
vm.runInContext(wizardSrc, context);

(async () => {
  const records = [
    { name: 'أحمد', phone: '0512345678' },
    { name: 'محمد', phone: '0522345678' },
    { name: 'أحمد', phone: '0512345678' }
  ];

  context._testStrategy = 'skip';
  const stats = context.analyzeImportRecords(records, { mode: 'clients_only', duplicateStrategy: 'skip' });
  if (stats.valid !== 2) errors.push('skip valid=' + stats.valid + ' expected 2');
  if (stats.skipped !== 1) errors.push('skip skipped=' + stats.skipped + ' expected 1');

  context.clientsRegistry = [];
  context.cases = [];
  vm.runInContext(`_importWizard = ${JSON.stringify({
    fileHash: 'abc123', fileName: 'test.xlsx', mapping: { name: 0, phone: 1 }
  })}`, context);
  context.DB.set('importHistory', [{ fileHash: 'abc123', fileName: 'test.xlsx', at: '2026-01-01', imported: 2 }]);
  context._testStrategy = 'skip';
  const result = await context.runClientImport(records, 'clients_only', {
    duplicateStrategy: 'skip', mapping: { name: 0, phone: 1 }
  });
  if (result.error) errors.push('reimport blocked: ' + result.error);
  if (result.imported !== 2) errors.push('imported=' + result.imported + ' expected 2');
  if (!result.reimport) errors.push('reimport flag expected true');

  context.clientsRegistry = [{ id: '1', name: 'أحمد', phone: '0512345678', patientId: '', nationality: '' }];
  context._testStrategy = 'update';
  const updateStats = context.analyzeImportRecords(
    [{ name: 'أحمد', phone: '0512345678', patientId: '123' }],
    { mode: 'clients_only', duplicateStrategy: 'update', mapping: { name: 0, phone: 1, patientId: 2 } }
  );
  if (updateStats.updates !== 1) errors.push('updateStats.updates=' + updateStats.updates);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert((pkg.build?.files || []).includes('import-engine-core.js'), 'package lists core');
  assert((pkg.build?.files || []).includes('import-engine-worker.js'), 'package lists worker');

  if (errors.length) {
    console.error('FAIL verify-client-import:');
    errors.forEach(e => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: full-release import engine — duplicate strategies + batch worker verified');
})();
