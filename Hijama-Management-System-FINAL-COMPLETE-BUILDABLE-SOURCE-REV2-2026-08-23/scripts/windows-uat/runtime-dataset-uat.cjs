#!/usr/bin/env node
'use strict';

/**
 * V2-3.5 runtime dataset UAT against installed userData path (or forced temp).
 * Seeds UAT-V2-3-5 via production database/backup modules — not mocks.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const { openDatabase } = require(path.join(root, 'database', 'connection.js'));
const backupV2 = require(path.join(root, 'electron', 'backup-v2-core.js'));

const evidenceDir = path.join(root, 'docs', 'integration-v2', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const userData =
  process.env.TDAWI_UAT_USER_DATA ||
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cupping Center');

const dbPath = path.join(userData, 'database', 'tadawi.db');
const out = {
  dataset: 'UAT-V2-3-5',
  userData,
  dbPath,
  startedAt: new Date().toISOString(),
  ok: false,
};

function sha256File(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function count(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(path.join(userData, 'database'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'attachments'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'backups'), { recursive: true });

  const devicePath = path.join(userData, 'device-identity.json');
  const branchPath = path.join(userData, 'branch-binding.json');
  const licensePath = path.join(userData, 'Local Storage', 'uat-license.txt');
  fs.mkdirSync(path.dirname(licensePath), { recursive: true });
  fs.writeFileSync(
    devicePath,
    JSON.stringify({ deviceId: 'UAT-DEVICE-001', createdAt: new Date().toISOString() }, null, 2)
  );
  fs.writeFileSync(
    branchPath,
    JSON.stringify({ branchId: 'BR-MAIN', orgId: 'ORG-UAT' }, null, 2)
  );
  fs.writeFileSync(licensePath, 'TEST-LICENSE-UAT-V2-3-5', 'utf8');
  fs.writeFileSync(
    path.join(userData, 'settings', 'app.json'),
    JSON.stringify({ centerName: 'UAT Center V2-3-5', theme: 'light' }, null, 2)
  );
  fs.writeFileSync(path.join(userData, 'attachments', 'note.txt'), 'uat-attachment', 'utf8');

  const db = openDatabase(dbPath);
  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  for (const table of ['clients', 'visits', 'invoices', 'appointments', 'employees']) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE id LIKE 'UAT-%'`).run();
    } catch {
      /* ignore */
    }
  }

  const clients = [
    ['UAT-C1', 'Client One', '0500000001'],
    ['UAT-C2', 'Client Two', '0500000002'],
    ['UAT-C3', 'Client Three', '0500000003'],
  ];
  for (const [id, name, phone] of clients) {
    db.prepare(
      `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, '{}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, updated_at=excluded.updated_at`
    ).run(id, name, phone, now, now);
  }

  const staff = [
    ['UAT-E1', 'Staff One', 3000],
    ['UAT-E2', 'Staff Two', 3500],
  ];
  for (const [id, name, salary] of staff) {
    db.prepare(
      `INSERT INTO employees (id, name, active, salary, payload_json, created_at, updated_at)
       VALUES (?, ?, 1, ?, '{}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, salary=excluded.salary, updated_at=excluded.updated_at`
    ).run(id, name, salary, now, now);
  }

  for (let i = 1; i <= 4; i++) {
    const id = `UAT-V${i}`;
    db.prepare(
      `INSERT INTO visits (id, client_id, date, total, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, 100, '{}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`
    ).run(id, `UAT-C${((i - 1) % 3) + 1}`, day, now, now);
  }

  for (let i = 1; i <= 3; i++) {
    const id = `UAT-I${i}`;
    db.prepare(
      `INSERT INTO invoices (id, visit_id, invoice_number, total, payload_json, created_at)
       VALUES (?, ?, ?, 100, '{}', ?)
       ON CONFLICT(id) DO UPDATE SET total=excluded.total`
    ).run(id, `UAT-V${i}`, `INV-UAT-${i}`, now);
  }

  for (let i = 1; i <= 2; i++) {
    const id = `UAT-A${i}`;
    db.prepare(
      `INSERT INTO appointments (id, client_id, date, time, status, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, '10:00', 'pending', '{}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`
    ).run(id, `UAT-C${i}`, day, now, now);
  }

  out.countsBeforeClose = {
    clients: count(db, 'clients'),
    visits: count(db, 'visits'),
    invoices: count(db, 'invoices'),
    appointments: count(db, 'appointments'),
    employees: count(db, 'employees'),
  };
  db.close();

  out.dbChecksumBefore = sha256File(dbPath);
  out.licenseChecksum = sha256File(licensePath);
  out.deviceId = JSON.parse(fs.readFileSync(devicePath, 'utf8')).deviceId;
  out.branchId = JSON.parse(fs.readFileSync(branchPath, 'utf8')).branchId;

  const db2 = openDatabase(dbPath);
  out.countsAfterReopen = {
    clients: count(db2, 'clients'),
    visits: count(db2, 'visits'),
    invoices: count(db2, 'invoices'),
    appointments: count(db2, 'appointments'),
    employees: count(db2, 'employees'),
  };
  db2.close();
  out.dbChecksumAfterReopen = sha256File(dbPath);

  const backupPath = path.join(userData, 'backups', 'uat-v2-3-5.tdw');
  const created = await backupV2.createBackupFile({
    userDataDir: userData,
    outputPath: backupPath,
    password: 'uat-v2-3-5-password',
    appVersion: '2.0.1',
    backupType: 'uat',
  });
  out.backup = { ok: created.ok === true, path: backupPath, hash: created.hash || null };

  const restoreDir = path.join(os.tmpdir(), `uat-restore-${Date.now()}`);
  fs.mkdirSync(restoreDir, { recursive: true });
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreDir,
    filePath: backupPath,
    password: 'uat-v2-3-5-password',
  });
  const restoredDb = path.join(restoreDir, 'database', 'tadawi.db');
  out.restore = {
    ok: restored.ok === true || fs.existsSync(restoredDb),
    dir: restoreDir,
    restoredDbExists: fs.existsSync(restoredDb),
  };

  out.ok =
    out.countsAfterReopen.clients >= 3 &&
    out.countsAfterReopen.visits >= 4 &&
    out.countsAfterReopen.invoices >= 3 &&
    out.countsAfterReopen.appointments >= 2 &&
    out.countsAfterReopen.employees >= 2 &&
    out.dbChecksumBefore === out.dbChecksumAfterReopen &&
    out.deviceId === 'UAT-DEVICE-001' &&
    out.branchId === 'BR-MAIN' &&
    out.backup.ok &&
    out.restore.ok;

  out.finishedAt = new Date().toISOString();
  const dest = path.join(evidenceDir, 'runtime-dataset-uat.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, dest, counts: out.countsAfterReopen }, null, 2));
  if (!out.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  out.error = String((err && err.stack) || err);
  fs.writeFileSync(path.join(evidenceDir, 'runtime-dataset-uat.json'), JSON.stringify(out, null, 2));
  process.exit(1);
});
