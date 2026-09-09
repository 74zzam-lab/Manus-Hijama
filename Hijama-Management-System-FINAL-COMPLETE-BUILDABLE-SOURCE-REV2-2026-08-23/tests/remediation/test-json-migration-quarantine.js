'use strict';

const assert = require('assert');
const migration = require('../../database/migrate-from-json');

const finding = migration.analyzeSnapshotForLoss({
  clientsRegistry: [{ id: 'C-1' }, { id: 'C-1', name: 'duplicate' }, { name: 'missing-id' }],
  doctors: [{ id: 'D-1' }],
  attendance: [{ id: 'A-1', doctorId: 'missing-doctor' }],
  cases: [{ id: 'V-1', clientRegistryId: 'missing-client' }],
  unknownOperationalArray: [{ id: 'X-1' }],
  _meta: { version: 3 },
});

assert.strictEqual(finding.ok, false, 'loss analysis must reject a snapshot with unrepresentable records');
assert.deepStrictEqual(
  finding.quarantine.map((row) => row.reason).sort(),
  ['duplicate_id', 'invalid_missing_id', 'orphan_attendance_employee', 'orphan_visit_client', 'unknown_operational_key'].sort(),
  'each potential loss must receive an explicit quarantine reason'
);
assert.strictEqual(finding.counts.quarantined, 5);
console.log('PASS remediation:json-migration-quarantine');
