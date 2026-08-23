#!/usr/bin/env node
/** Smoke test Import Studio (simplified). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = {
  clientsRegistry: [], cases: [],
  settings: { cupPrice: 50, vatRate: 15 },
  DB: { _data: {}, get(k, d) { return this._data[k] !== undefined ? this._data[k] : d; }, set(k, v) { this._data[k] = v; } },
  IMPORT_FIELDS: {
    name: { label: 'اسم', required: true },
    phone: { label: 'جوال', required: true },
    cups: { label: 'كاسات', required: false },
    date: { label: 'تاريخ', required: false }
  },
  IMPORT_COLUMN_ALIASES: { name: ['اسم'], phone: ['جوال'], cups: ['كاسات'], date: ['تاريخ'] },
  normalizeImportPhone: (v) => String(v || '').replace(/\D/g, ''),
  normalizeImportName: (v) => String(v || '').trim(),
  parseImportDate: (v) => String(v || '').slice(0, 10),
  scoreColumnMatch: () => 50,
  findRegistryByPhoneName: () => null,
  performance: { now: () => Date.now() }
};

vm.createContext(ctx);
['import-studio-core.js', 'import-studio-normalize.js', 'import-studio-transform.js', 'import-studio-join.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(root, 'import-studio', f), 'utf8'), ctx);
});

const st = ctx.importStudioDefaultState();
st.files = [{ id: 'f1', name: 't.xlsx', headers: ['الاسم', 'الجوال'], rawRows: [{ 'الاسم': 'أ', 'الجوال': '0512345678' }], rowCount: 1 }];
const fields = ctx.importStudioGetActiveFieldDefs();
st.columnRules = { f1: ctx.importStudioBuildDefaultColumnRules(st.files[0], fields) };

const mode = ctx.importStudioResolveLegacyModeFromMapping(st.columnRules, 'f1');
if (mode !== 'clients_only') { console.error('FAIL: expected clients_only'); process.exit(1); }
if (!ctx.importStudioCanProceed({ ...st, step: 2 })) { console.error('FAIL: canProceed step 2'); process.exit(1); }
console.log('OK: simplified Import Studio verified');
