#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cloudDbSrc = fs.readFileSync(path.join(root, 'cupping-cloud-db-backup.js'), 'utf8');
const backupLayerSrc = fs.readFileSync(path.join(root, 'cloud', 'backup-layer.js'), 'utf8');
const errors = [];

function check(ok, msg) { if (!ok) errors.push(msg); }

check(indexSrc.includes('organizationId:'), 'buildFullBackupObject must include organizationId');
check(indexSrc.includes('centerId:'), 'buildFullBackupObject must include centerId');
check(indexSrc.includes('branchId:'), 'buildFullBackupObject must include branchId');
check(indexSrc.includes('ownerMode:'), 'buildFullBackupObject must include ownerMode');

check(cloudDbSrc.includes('organizationId:'), 'CloudDb backup meta must include organizationId');
check(cloudDbSrc.includes('centerId,'), 'CloudDb backup meta must include centerId');
check(cloudDbSrc.includes('branchId,'), 'CloudDb backup meta must include branchId');
check(cloudDbSrc.includes('ownerMode'), 'CloudDb backup meta must include ownerMode');

check(backupLayerSrc.includes('data._meta.organizationId'), 'BackupLayer payload must persist organizationId');
check(backupLayerSrc.includes('data._meta.branchId'), 'BackupLayer payload must persist branchId');
check(backupLayerSrc.includes('data._meta.ownerMode'), 'BackupLayer payload must persist ownerMode');

if (errors.length) {
  console.error('FAIL: phase35 backup org/branch metadata');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase35 backup org/branch metadata checks');
