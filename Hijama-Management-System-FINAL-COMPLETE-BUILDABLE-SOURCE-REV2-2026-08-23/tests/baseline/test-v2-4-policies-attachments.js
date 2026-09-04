#!/usr/bin/env node
'use strict';

const { classify, CATEGORIES, backoffMs } = require('../../database/sync-error-classify');
const { CATALOG, assertCatalogComplete, listSyncedTables } = require('../../database/table-sync-catalog');
const {
  validateAttachment,
  attachmentRemotePath,
  writeLocalBlob,
  readLocalBlob,
  sha256Buffer,
} = require('../../database/attachment-sync');
const fs = require('fs');
const os = require('os');
const path = require('path');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

// Error classification
{
  check(classify({ offline: true }).category === CATEGORIES.OFFLINE, 'offline');
  check(classify({ status: 401 }).category === CATEGORIES.UNAUTHORIZED, '401');
  check(classify({ status: 429 }).category === CATEGORIES.RATE_LIMIT, '429');
  check(classify({ message: 'conflict_detected_push' }).category === CATEGORIES.CONFLICT, 'conflict');
  check(classify({ message: 'ENOSPC' }).category === CATEGORIES.DISK_FULL, 'disk');
  check(classify({ message: 'corrupt json' }).preserveLocal === true, 'corrupt preserves local');
  check(classify({ message: 'quota exceeded' }).pauseSync === true, 'quota pauses');
  const bo = backoffMs(3, 1000, 300000);
  check(bo >= 1000 && bo <= 300000, 'backoff bounded');
}

// Catalog covers SyncEngine tables
{
  const required = [
    'cases', 'clientsRegistry', 'bookings', 'expenses', 'attendance', 'doctors',
    'inventoryItems', 'inventorySuppliers', 'inventoryMovements',
    'settings', 'services', 'packages', 'users',
  ];
  const r = assertCatalogComplete(required);
  check(r.ok, `catalog missing: ${r.missing.join(',')}`);
  check(listSyncedTables().includes('attachments_meta'), 'attachments_meta in catalog');
  check(CATALOG.inventoryMovements.merge === 'append-only', 'inventory append-only');
  check(CATALOG.cases.conflict === 'manual-financial', 'cases financial conflict');
}

// Attachments
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v24-att-'));
  const good = Buffer.from('%PDF-1.4 test');
  const hash = sha256Buffer(good);
  const v = validateAttachment({ filename: 'report.pdf', mime: 'application/pdf' }, good);
  check(v.ok, 'pdf ok');
  check(v.sha256 === hash, 'hash match');
  const dest = writeLocalBlob(root, hash, good);
  check(fs.existsSync(dest), 'blob written');
  check(Buffer.compare(readLocalBlob(root, hash), good) === 0, 'blob read');
  const bad = validateAttachment({ filename: '../evil.exe' }, Buffer.from('MZ'));
  check(!bad.ok && bad.errors.includes('executable_extension_blocked'), 'exe blocked');
  const trav = validateAttachment({ filename: 'x.pdf', remotePath: '../../etc/passwd' }, good);
  check(!trav.ok && trav.errors.includes('path_traversal'), 'path traversal blocked');
  const p = attachmentRemotePath('CTR1', 'BR-A', hash);
  check(p.includes('/centers/CTR1/branches/BR-A/attachments/'), 'remote path id-stable');
  let threw = false;
  try { attachmentRemotePath('CTR1', 'BR-A', 'not-a-hash'); } catch { threw = true; }
  check(threw, 'invalid hash rejected');
  fs.rmSync(root, { recursive: true, force: true });
}

// Drive layout ID paths (require module via vm-less: load as text check + node require of peer)
{
  // Evaluate drive-layout helpers by requiring via a tiny stub — drive-layout is IIFE for browser.
  // Contract check: FileRemote uses NajjarTech/{centerId} style; DriveLayout id paths documented in code.
  const layoutSrc = fs.readFileSync(path.join(__dirname, '../../cloud/drive-layout.js'), 'utf8');
  check(layoutSrc.includes('function idCenterRoot'), 'idCenterRoot present');
  check(layoutSrc.includes('centers/'), 'centers/ path');
  check(layoutSrc.includes('attachmentBlobPath'), 'attachmentBlobPath present');
  check(layoutSrc.includes('devicesRegistryJson'), 'devicesRegistryJson present');
}

if (errors.length) {
  console.error('FAIL: v2-4 policies/attachments/errors');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: v2-4 error classify + sync catalog + attachments');
