#!/usr/bin/env node
/**
 * Phase 12 — operational DB health gates (integrity, FK, schema).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

const operationalDbHealth = require('../database/operational-db-health');
const { openDatabase } = require('../database/connection');
const hybridSchema = require('../database/hybrid-schema');
const truth = require('../database/operational-error-truth');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p12-health-'));
const dbPath = path.join(tmpDir, 'clinic.db');

const db = openDatabase(dbPath);
const healthy = operationalDbHealth.assessHealth(db);
assert(healthy.ok === true, 'fresh db healthy');
assert(healthy.schemaVersion === hybridSchema.CURRENT_SCHEMA_VERSION, 'schema version matches');
assert(operationalDbHealth.isWriteAllowed(healthy), 'write allowed when healthy');

const gate = operationalDbHealth.assertWriteAllowed(healthy);
assert(gate.ok === true, 'assertWriteAllowed passes');

const badHealth = {
  ok: false,
  blocked: true,
  reasons: ['integrity_check_failed'],
  messageAr: 'test',
};
const denied = operationalDbHealth.assertWriteAllowed(badHealth);
assert(denied.ok === false && denied.error === 'database_unhealthy', 'assertWriteAllowed denies');

// Simulate FK violation report
const fkBad = operationalDbHealth.assessHealth(db, {
  maintenance: {
    integrityCheck: () => ({ ok: true, detail: 'ok' }),
    foreignKeyCheck: () => ({ ok: false, violations: 1, rows: [{ table: 'visits', rowid: 1 }] }),
  },
  expectedSchemaVersion: hybridSchema.CURRENT_SCHEMA_VERSION,
});
assert(!fkBad.ok && fkBad.reasons.includes('foreign_key_violation'), 'FK violation detected');

const schemaBad = operationalDbHealth.assessHealth(db, {
  maintenance: {
    integrityCheck: () => ({ ok: true, detail: 'ok' }),
    foreignKeyCheck: () => ({ ok: true, violations: 0 }),
  },
  expectedSchemaVersion: hybridSchema.CURRENT_SCHEMA_VERSION + 99,
});
assert(!schemaBad.ok && schemaBad.reasons.includes('schema_version_mismatch'), 'schema mismatch detected');

const msg = truth.present('database_unhealthy');
assert(msg.userMessageAr.includes('نسخة احتياطية'), 'database_unhealthy Arabic catalog');

db.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (errors.length) {
  console.error('FAIL verify-operational-db-health');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS verify-operational-db-health');
