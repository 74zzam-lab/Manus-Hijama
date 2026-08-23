#!/usr/bin/env node
'use strict';

/**
 * V2-5.7 — Migration harness: run V2-4→V2-5 proofs → evidence/migration-*.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-7', 'evidence');
const { runMigrationReleaseProofs } = require(path.join(root, 'database', 'migration-release.js'));

function writeJson(name, data) {
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v257-mig-harness-'));
  const report = runMigrationReleaseProofs({ tmpDir, cleanup: false });

  writeJson('migration-all.json', report);
  writeJson('migration-schema-step.json', {
    id: 'MIG-257-001',
    ...(report.proofs.schemaStep001to002 || {}),
    at: report.finishedAt,
  });
  writeJson('migration-preserve-records.json', {
    id: 'MIG-257-002',
    ok: !!(report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.ok),
    before: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.before,
    after: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after,
    compare: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.compare,
  });
  writeJson('migration-preserve-attachments.json', {
    id: 'MIG-257-003',
    ok: !!(
      report.proofs.preserveUpgrade &&
      report.proofs.preserveUpgrade.ok &&
      report.proofs.preserveUpgrade.before.attachments >= 1 &&
      report.proofs.preserveUpgrade.after.attachments ===
        report.proofs.preserveUpgrade.before.attachments
    ),
    attachmentsBefore:
      report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.before.attachmentRows,
    attachmentsAfter:
      report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.attachmentRows,
  });
  writeJson('migration-preserve-outbox.json', {
    id: 'MIG-257-004',
    ok: !!(
      report.proofs.preserveUpgrade &&
      report.proofs.preserveUpgrade.ok &&
      report.proofs.preserveUpgrade.before.outbox >= 1
    ),
    outboxBefore: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.before.outboxRows,
    outboxAfter: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.outboxRows,
  });
  writeJson('migration-preserve-owner.json', {
    id: 'MIG-257-005',
    ok: !!(
      report.proofs.preserveUpgrade &&
      report.proofs.preserveUpgrade.before.meta.ownerUserId ===
        report.proofs.preserveUpgrade.after.meta.ownerUserId &&
      JSON.stringify(report.proofs.preserveUpgrade.before.users) ===
        JSON.stringify(report.proofs.preserveUpgrade.after.users)
    ),
    ownerBefore: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.before.meta.ownerUserId,
    ownerAfter: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.meta.ownerUserId,
    users: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.users,
  });
  writeJson('migration-preserve-license.json', {
    id: 'MIG-257-006',
    ok: !!(
      report.proofs.preserveUpgrade &&
      report.proofs.preserveUpgrade.before.meta.licenseId ===
        report.proofs.preserveUpgrade.after.meta.licenseId &&
      report.proofs.preserveUpgrade.before.meta.deviceId ===
        report.proofs.preserveUpgrade.after.meta.deviceId &&
      report.proofs.preserveUpgrade.before.meta.branchId ===
        report.proofs.preserveUpgrade.after.meta.branchId
    ),
    licenseId: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.meta.licenseId,
    deviceId: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.meta.deviceId,
    branchId: report.proofs.preserveUpgrade && report.proofs.preserveUpgrade.after.meta.branchId,
  });
  writeJson('migration-failure-rollback.json', {
    id: 'MIG-257-007',
    ...(report.proofs.corruptRefuse || {}),
    note: 'Corrupt open throws DatabaseOpenError; original file preserved (no empty replace)',
  });
  writeJson('migration-no-empty-replace.json', {
    id: 'MIG-257-008',
    ok: !!(report.proofs.corruptRefuse && report.proofs.corruptRefuse.refusedEmptyReplace),
    ...(report.proofs.corruptRefuse || {}),
  });
  writeJson('migration-pre-backup.json', {
    id: 'MIG-257-009',
    ...(report.proofs.preMigrationBackup || {}),
  });
  writeJson('migration-restore-backup.json', {
    id: 'MIG-257-010',
    ...(report.proofs.restoreOldBackup || {}),
  });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        proofs: Object.fromEntries(
          Object.entries(report.proofs || {}).map(([k, v]) => [k, !!(v && v.ok)])
        ),
      },
      null,
      2
    )
  );
  if (!report.ok) process.exit(1);
}

main();
