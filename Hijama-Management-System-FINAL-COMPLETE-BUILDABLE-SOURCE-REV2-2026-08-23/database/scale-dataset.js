'use strict';

/**
 * V2-5.5 — synthetic scale dataset for SQLite performance benches.
 */

const FULL_TARGETS = {
  clients: 100000,
  visits: 500000,
  invoices: 50000,
  appointments: 50000,
  attachments: 10000,
};

const TINY_TARGETS = {
  clients: 200,
  visits: 500,
  invoices: 100,
  appointments: 100,
  attachments: 50,
};

const TABLES = ['clients', 'visits', 'invoices', 'appointments', 'attachments'];

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function resolveTargets(options) {
  const base = options && options.tiny ? TINY_TARGETS : FULL_TARGETS;
  const o = options || {};
  return {
    clients: Number(o.clients != null ? o.clients : base.clients),
    visits: Number(o.visits != null ? o.visits : base.visits),
    invoices: Number(o.invoices != null ? o.invoices : base.invoices),
    appointments: Number(o.appointments != null ? o.appointments : base.appointments),
    attachments: Number(o.attachments != null ? o.attachments : base.attachments),
  };
}

function countTables(db) {
  const counts = {};
  for (const t of TABLES) {
    counts[t] = Number(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c);
  }
  return counts;
}

/** Indexes already exist in 001_initial; re-apply IF NOT EXISTS for safety. */
function ensureMinimalIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
    CREATE INDEX IF NOT EXISTS idx_clients_file_no ON clients(file_no);
    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
    CREATE INDEX IF NOT EXISTS idx_visits_invoice ON visits(invoice);
    CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
  `);
  return { ok: true };
}

function bulkInsert(db, insertFn, n, batchSize) {
  const size = batchSize || 5000;
  const runBatch = db.transaction((start, end) => {
    for (let i = start; i < end; i++) insertFn(i);
  });
  for (let start = 0; start < n; start += size) {
    runBatch(start, Math.min(start + size, n));
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options] count overrides; { tiny: true } for CI profile
 * @returns {{ ok: boolean, counts: object, ms: number, targets: object }}
 */
function generateScaleDataset(db, options) {
  const targets = resolveTargets(options);
  const started = Date.now();
  const now = new Date().toISOString();
  const payload = '{}';
  const cw = Math.max(7, String(targets.clients).length);
  const vw = Math.max(7, String(targets.visits).length);

  ensureMinimalIndexes(db);

  const insClient = db.prepare(
    `INSERT OR IGNORE INTO clients (id, file_no, name, phone, payload_json, created_at, updated_at)
     VALUES (@id, @file_no, @name, @phone, @payload_json, @created_at, @updated_at)`
  );
  bulkInsert(db, (i) => {
    const n = i + 1;
    const id = `c${pad(n, cw)}`;
    insClient.run({
      id,
      file_no: `F${pad(n, cw)}`,
      name: `Client ${n}`,
      phone: `05${pad(n % 100000000, 8)}`,
      payload_json: payload,
      created_at: now,
      updated_at: now,
    });
  }, targets.clients);

  const insVisit = db.prepare(
    `INSERT OR IGNORE INTO visits (id, invoice, client_id, date, total, payload_json, created_at, updated_at)
     VALUES (@id, @invoice, @client_id, @date, @total, @payload_json, @created_at, @updated_at)`
  );
  bulkInsert(db, (i) => {
    const n = i + 1;
    const clientN = (i % targets.clients) + 1;
    const day = pad((i % 28) + 1, 2);
    const month = pad((i % 12) + 1, 2);
    insVisit.run({
      id: `v${pad(n, vw)}`,
      invoice: `INV-${pad(n, vw)}`,
      client_id: `c${pad(clientN, cw)}`,
      date: `2024-${month}-${day}`,
      total: (i % 500) + 50,
      payload_json: payload,
      created_at: now,
      updated_at: now,
    });
  }, targets.visits);

  const insInvoice = db.prepare(
    `INSERT OR IGNORE INTO invoices (id, visit_id, invoice_number, total, payload_json, created_at)
     VALUES (@id, @visit_id, @invoice_number, @total, @payload_json, @created_at)`
  );
  const invoiceN = Math.min(targets.invoices, targets.visits);
  bulkInsert(db, (i) => {
    const n = i + 1;
    insInvoice.run({
      id: `inv${pad(n, vw)}`,
      visit_id: `v${pad(n, vw)}`,
      invoice_number: `NUM-${pad(n, vw)}`,
      total: (i % 400) + 20,
      payload_json: payload,
      created_at: now,
    });
  }, invoiceN);

  const insAppt = db.prepare(
    `INSERT OR IGNORE INTO appointments (id, client_id, date, time, status, payload_json, created_at, updated_at)
     VALUES (@id, @client_id, @date, @time, @status, @payload_json, @created_at, @updated_at)`
  );
  bulkInsert(db, (i) => {
    const n = i + 1;
    const clientN = (i % Math.max(1, targets.clients)) + 1;
    const day = pad((i % 28) + 1, 2);
    insAppt.run({
      id: `a${pad(n, vw)}`,
      client_id: `c${pad(clientN, cw)}`,
      date: `2024-06-${day}`,
      time: `${pad(i % 24, 2)}:00`,
      status: i % 3 === 0 ? 'done' : 'pending',
      payload_json: payload,
      created_at: now,
      updated_at: now,
    });
  }, targets.appointments);

  const insAtt = db.prepare(
    `INSERT OR IGNORE INTO attachments (id, entity_type, entity_id, path, mime, payload_json, created_at)
     VALUES (@id, @entity_type, @entity_id, @path, @mime, @payload_json, @created_at)`
  );
  bulkInsert(db, (i) => {
    const n = i + 1;
    const clientN = (i % Math.max(1, targets.clients)) + 1;
    insAtt.run({
      id: `att${pad(n, vw)}`,
      entity_type: 'client',
      entity_id: `c${pad(clientN, cw)}`,
      path: `attachments/c${pad(clientN, cw)}/${n}.bin`,
      mime: 'application/octet-stream',
      payload_json: payload,
      created_at: now,
    });
  }, targets.attachments);

  const counts = countTables(db);
  const ms = Date.now() - started;
  const ok =
    counts.clients >= targets.clients &&
    counts.visits >= targets.visits &&
    counts.invoices >= Math.min(targets.invoices, targets.visits) &&
    counts.appointments >= targets.appointments &&
    counts.attachments >= targets.attachments;

  return { ok, counts, ms, targets };
}

module.exports = {
  FULL_TARGETS,
  TINY_TARGETS,
  TABLES,
  countTables,
  ensureMinimalIndexes,
  generateScaleDataset,
  resolveTargets,
};
