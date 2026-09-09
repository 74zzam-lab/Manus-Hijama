#!/usr/bin/env node
/**
 * PR4 — SQLite Operational Truth verifier (static + registry wiring).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const registry = require('../database/sqlite-operational-registry');

const checks = [
  { name: 'registry module exports CORE_TABLES', ok: Array.isArray(registry.CORE_TABLES) && registry.CORE_TABLES.length >= 6 },
  { name: 'registry includes attachments_meta', ok: registry.KV_OPERATIONAL.includes('attachments_meta') },
  { name: 'registry includes owner profile key', ok: registry.KV_OPERATIONAL.includes('__tdw_owner_profile__') },
  { name: 'registry includes inventory keys', ok: registry.KV_OPERATIONAL.includes('inventoryItems') },
  { name: 'registry includes systemLogs', ok: registry.KV_OPERATIONAL.includes('systemLogs') },
  { name: 'registry blocks LS when Electron DB present', ok: typeof registry.shouldBlockLocalStorageForKey === 'function'
    && registry.shouldBlockLocalStorageForKey('cases', true) === true
    && registry.shouldBlockLocalStorageForKey('backupRegistry', true) === false },
  { name: 'bridge defines readOperational', ok: /function readOperational/.test(bridge) },
  { name: 'bridge defines shouldBlockLocalStorage', ok: /function shouldBlockLocalStorage/.test(bridge) },
  { name: 'bridge stale LS guard on hydrate', ok: /noteStaleLocalStorageOverride/.test(bridge) },
  { name: 'bridge uses operational registry', ok: /SqliteOperationalRegistry/.test(bridge) },
  { name: 'index loads operational registry script', ok: /database\/sqlite-operational-registry\.js/.test(html) },
  { name: 'index DB.get passes def to readOperational', ok: /readOperational\(k,\s*def\)/.test(html) },
  { name: 'index DB.get blocks LS for operational keys', ok: /shouldBlockLocalStorage/.test(html) },
  { name: 'index reloadClientStoreFromDb includes inventory', ok: /inventoryItems = DB\.get\('inventoryItems'/.test(html) },
  { name: 'index not localStorage-only label', ok: !/DATA STORE \(localStorage-based persistence\)/.test(html) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nAll SQLite operational truth checks passed.');
