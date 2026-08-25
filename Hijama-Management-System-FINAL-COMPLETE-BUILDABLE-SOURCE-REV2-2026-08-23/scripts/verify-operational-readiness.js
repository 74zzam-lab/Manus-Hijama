#!/usr/bin/env node
/**
 * Phase 13 — operational readiness aggregation (health + migration + sqlite).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

const operationalReadiness = require('../database/operational-readiness');
const operationalDbHealth = require('../database/operational-db-health');
const { openDatabase } = require('../database/connection');
const truth = require('../database/operational-error-truth');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p13-ready-'));
const dbPath = path.join(tmpDir, 'clinic.db');
const db = openDatabase(dbPath);
const health = operationalDbHealth.assessHealth(db);
db.close();

const ready = operationalReadiness.assessOperationalReadiness({
  health,
  sqlitePrimary: true,
  legacyBranchMigrationBlocked: false,
});
assert(ready.ok === true && ready.canWrite === true, 'healthy clinic operational');

const blocked = operationalReadiness.assessOperationalReadiness({
  health: { ok: false, reasons: ['integrity_check_failed'], messageAr: 'test' },
  legacyBranchMigrationBlocked: true,
  sqlitePrimary: false,
  sqlitePrimaryRequired: true,
});
assert(!blocked.ok, 'blocked when health + legacy + sqlite');
assert(
  blocked.blockers.includes('integrity_check_failed')
    && blocked.blockers.includes('legacy_branch_migration_required')
    && blocked.blockers.includes('sqlite_primary_required'),
  'all blockers listed'
);

const denied = operationalReadiness.assertOperationalReady(blocked);
assert(denied.ok === false && denied.error === 'integrity_check_failed', 'assertOperationalReady');

const msg = truth.present('operational_not_ready');
assert(msg.userMessageAr.includes('التشغيل'), 'operational_not_ready catalog');

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (errors.length) {
  console.error('FAIL verify-operational-readiness');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS verify-operational-readiness');
