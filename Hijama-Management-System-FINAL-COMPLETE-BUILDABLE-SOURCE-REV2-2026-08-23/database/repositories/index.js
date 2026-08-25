'use strict';

const branchSlice = require('./branch-slice');

function nowIso() {
  return new Date().toISOString();
}

function createClientRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO clients (id, file_no, key, name, phone, patient_id, nationality, is_vip,
      default_invoice_type, branch_id, payload_json, created_at, updated_at, revision)
    VALUES (@id, @file_no, @key, @name, @phone, @patient_id, @nationality, @is_vip,
      @default_invoice_type, @branch_id, @payload_json, @created_at, @updated_at, @revision)
    ON CONFLICT(id) DO UPDATE SET
      file_no=excluded.file_no, key=excluded.key, name=excluded.name, phone=excluded.phone,
      patient_id=excluded.patient_id, nationality=excluded.nationality, is_vip=excluded.is_vip,
      default_invoice_type=excluded.default_invoice_type, branch_id=excluded.branch_id,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at, revision=excluded.revision
  `);

  return {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
    getAll: () => db.prepare('SELECT payload_json FROM clients').all().map((r) => JSON.parse(r.payload_json)),
    getById: (id) => {
      const row = db.prepare('SELECT payload_json FROM clients WHERE id = ?').get(id);
      return row ? JSON.parse(row.payload_json) : null;
    },
    upsert(record) {
      if (!record || !record.id) throw Object.assign(new Error('client_id_required'), { code: 'DB_CONSTRAINT' });
      if (!record.name) throw Object.assign(new Error('client_name_required'), { code: 'DB_CONSTRAINT' });
      const payload = { ...record };
      upsert.run({
        id: String(record.id),
        file_no: record.fileNo || null,
        key: record.key || null,
        name: String(record.name),
        phone: record.phone || null,
        patient_id: record.patientId || null,
        nationality: record.nationality || null,
        is_vip: record.isVip ? 1 : 0,
        default_invoice_type: record.defaultInvoiceType || null,
        branch_id: record.branchId || null,
        payload_json: JSON.stringify(payload),
        created_at: record.createdAt || nowIso(),
        updated_at: record.updatedAt || nowIso(),
        revision: record.revision || 1,
      });
      return record;
    },
    replaceAll(list) {
      const tx = db.transaction((items) => {
        const ids = new Set();
        for (const item of items || []) {
          this.upsert(item);
          ids.add(String(item.id));
        }
        for (const row of db.prepare('SELECT id FROM clients').all()) {
          if (ids.has(String(row.id))) continue;
          db.prepare('UPDATE visits SET client_id = NULL WHERE client_id = ?').run(row.id);
          db.prepare('DELETE FROM clients WHERE id = ?').run(row.id);
        }
      });
      tx(list);
    },
    replaceBranchSlice(list, branchId) {
      branchSlice.replaceBranchSlice(db, 'clients', this, list, branchId, (id) => {
        db.prepare('UPDATE visits SET client_id = NULL WHERE client_id = ?').run(id);
      });
    },
    countForBranch: (branchId) => branchSlice.countForBranch(db, 'clients', branchId),
    getByIdScoped: (id, branchId) => branchSlice.getByIdScoped(db, 'clients', id, branchId),
    getAllForBranch: (branchId) => branchSlice.listForBranch(db, 'clients', branchId),
  };
}

function createVisitRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO visits (id, invoice, client_id, doctor_id, date, service_type, cups, total,
      pre_tax, vat, cash, card, commission, branch_id, payload_json, created_at, updated_at, revision)
    VALUES (@id, @invoice, @client_id, @doctor_id, @date, @service_type, @cups, @total,
      @pre_tax, @vat, @cash, @card, @commission, @branch_id, @payload_json, @created_at, @updated_at, @revision)
    ON CONFLICT(id) DO UPDATE SET
      invoice=excluded.invoice, client_id=excluded.client_id, doctor_id=excluded.doctor_id,
      date=excluded.date, service_type=excluded.service_type, cups=excluded.cups, total=excluded.total,
      pre_tax=excluded.pre_tax, vat=excluded.vat, cash=excluded.cash, card=excluded.card,
      commission=excluded.commission, branch_id=excluded.branch_id, payload_json=excluded.payload_json,
      updated_at=excluded.updated_at, revision=excluded.revision
  `);

  return {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM visits').get().c,
    sumTotal: () => db.prepare('SELECT COALESCE(SUM(total),0) AS s FROM visits').get().s,
    getAll: () => db.prepare('SELECT payload_json FROM visits').all().map((r) => JSON.parse(r.payload_json)),
    upsert(record) {
      if (!record || !record.id) throw Object.assign(new Error('visit_id_required'), { code: 'DB_CONSTRAINT' });
      const total = Math.max(0, Number(record.total) || 0);
      upsert.run({
        id: String(record.id),
        invoice: record.invoice || null,
        client_id: record.clientRegistryId || null,
        doctor_id: record.doctorId || null,
        date: record.date || null,
        service_type: record.serviceType || null,
        cups: record.cups != null ? Number(record.cups) : null,
        total,
        pre_tax: record.preTax != null ? Number(record.preTax) : null,
        vat: record.vat != null ? Number(record.vat) : null,
        cash: record.cash != null ? Number(record.cash) : null,
        card: record.card != null ? Number(record.card) : null,
        commission: record.commission != null ? Number(record.commission) : null,
        branch_id: record.branchId || null,
        payload_json: JSON.stringify(record),
        created_at: record.createdAt || nowIso(),
        updated_at: record.updatedAt || nowIso(),
        revision: record.revision || 1,
      });
      return record;
    },
    replaceAll(list) {
      const tx = db.transaction((items) => {
        const ids = new Set();
        for (const item of items || []) {
          this.upsert(item);
          ids.add(String(item.id));
        }
        for (const row of db.prepare('SELECT id FROM visits').all()) {
          if (ids.has(String(row.id))) continue;
          db.prepare('DELETE FROM visit_cups WHERE visit_id = ?').run(row.id);
          db.prepare('DELETE FROM visits WHERE id = ?').run(row.id);
        }
      });
      tx(list);
    },
    replaceBranchSlice(list, branchId) {
      branchSlice.replaceBranchSlice(db, 'visits', this, list, branchId, (id) => {
        db.prepare('DELETE FROM visit_cups WHERE visit_id = ?').run(id);
      });
    },
    countForBranch: (branchId) => branchSlice.countForBranch(db, 'visits', branchId),
    getByIdScoped: (id, branchId) => branchSlice.getByIdScoped(db, 'visits', id, branchId),
    getAllForBranch: (branchId) => branchSlice.listForBranch(db, 'visits', branchId),
    sumTotalForBranch: (branchId) => branchSlice.sumTotalForBranch(db, branchId),
  };
}

function createBookingRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO appointments (id, client_id, doctor_id, date, time, status, service, branch_id, payload_json, created_at, updated_at)
    VALUES (@id, @client_id, @doctor_id, @date, @time, @status, @service, @branch_id, @payload_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      client_id=excluded.client_id, doctor_id=excluded.doctor_id, date=excluded.date, time=excluded.time,
      status=excluded.status, service=excluded.service, branch_id=excluded.branch_id,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `);
  return {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM appointments').get().c,
    getAll: () => db.prepare('SELECT payload_json FROM appointments').all().map((r) => JSON.parse(r.payload_json)),
    upsert(record) {
      if (!record?.id || !record.date) throw Object.assign(new Error('booking_invalid'), { code: 'DB_CONSTRAINT' });
      upsert.run({
        id: String(record.id),
        client_id: record.clientRegistryId || null,
        doctor_id: record.doctorId || null,
        date: record.date,
        time: record.time || null,
        status: record.status || 'pending',
        service: record.service || null,
        branch_id: record.branchId || null,
        payload_json: JSON.stringify(record),
        created_at: record.createdAt || nowIso(),
        updated_at: nowIso(),
      });
      return record;
    },
    replaceAll(list) {
      const tx = db.transaction((items) => {
        const ids = new Set();
        for (const item of items || []) {
          this.upsert(item);
          ids.add(String(item.id));
        }
        for (const row of db.prepare('SELECT id FROM appointments').all()) {
          if (!ids.has(String(row.id))) db.prepare('DELETE FROM appointments WHERE id = ?').run(row.id);
        }
      });
      tx(list);
    },
    replaceBranchSlice(list, branchId) {
      branchSlice.replaceBranchSlice(db, 'appointments', this, list, branchId);
    },
    countForBranch: (branchId) => branchSlice.countForBranch(db, 'appointments', branchId),
    getByIdScoped: (id, branchId) => branchSlice.getByIdScoped(db, 'appointments', id, branchId),
    getAllForBranch: (branchId) => branchSlice.listForBranch(db, 'appointments', branchId),
  };
}

function createEmployeeRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO employees (id, name, active, salary, branch_id, payload_json, created_at, updated_at)
    VALUES (@id, @name, @active, @salary, @branch_id, @payload_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, active=excluded.active, salary=excluded.salary, branch_id=excluded.branch_id,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `);
  return {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM employees').get().c,
    getAll: () => db.prepare('SELECT payload_json FROM employees').all().map((r) => JSON.parse(r.payload_json)),
    upsert(record) {
      if (!record?.id || !record.name) throw Object.assign(new Error('employee_invalid'), { code: 'DB_CONSTRAINT' });
      const salary = Math.max(0, Number(record.salary) || 0);
      upsert.run({
        id: String(record.id),
        name: String(record.name),
        active: record.active === false ? 0 : 1,
        salary,
        branch_id: record.branchId || null,
        payload_json: JSON.stringify(record),
        created_at: record.createdAt || nowIso(),
        updated_at: nowIso(),
      });
      return record;
    },
    replaceAll(list) {
      const tx = db.transaction((items) => {
        const ids = new Set();
        for (const item of items || []) {
          this.upsert(item);
          ids.add(String(item.id));
        }
        for (const row of db.prepare('SELECT id FROM employees').all()) {
          if (ids.has(String(row.id))) continue;
          db.prepare('DELETE FROM attendance WHERE employee_id = ?').run(row.id);
          db.prepare('DELETE FROM employees WHERE id = ?').run(row.id);
        }
      });
      tx(list);
    },
    replaceBranchSlice(list, branchId) {
      branchSlice.replaceBranchSlice(db, 'employees', this, list, branchId, (id) => {
        db.prepare('DELETE FROM attendance WHERE employee_id = ?').run(id);
      });
    },
    countForBranch: (branchId) => branchSlice.countForBranch(db, 'employees', branchId),
    getByIdScoped: (id, branchId) => branchSlice.getByIdScoped(db, 'employees', id, branchId),
    getAllForBranch: (branchId) => branchSlice.listForBranch(db, 'employees', branchId),
  };
}

function createAttendanceRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO attendance (id, employee_id, date, type, total_hours, payload_json, created_at)
    VALUES (@id, @employee_id, @date, @type, @total_hours, @payload_json, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      employee_id=excluded.employee_id, date=excluded.date, type=excluded.type,
      total_hours=excluded.total_hours, payload_json=excluded.payload_json
  `);
  return {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM attendance').get().c,
    getAll: () => db.prepare('SELECT payload_json FROM attendance').all().map((r) => JSON.parse(r.payload_json)),
    upsert(record) {
      if (!record?.id || !record.doctorId || !record.date) {
        throw Object.assign(new Error('attendance_invalid'), { code: 'DB_CONSTRAINT' });
      }
      upsert.run({
        id: String(record.id),
        employee_id: String(record.doctorId),
        date: record.date,
        type: record.type || null,
        total_hours: record.totalHours != null ? Number(record.totalHours) : null,
        payload_json: JSON.stringify(record),
        created_at: record.createdAt || nowIso(),
      });
      return record;
    },
    replaceAll(list) {
      const tx = db.transaction((items) => {
        const ids = new Set();
        for (const item of items || []) {
          this.upsert(item);
          ids.add(String(item.id));
        }
        for (const row of db.prepare('SELECT id FROM attendance').all()) {
          if (!ids.has(String(row.id))) db.prepare('DELETE FROM attendance WHERE id = ?').run(row.id);
        }
      });
      tx(list);
    },
    replaceBranchSlice(list, branchId) {
      branchSlice.replaceAttendanceBranchSlice(db, this, list, branchId);
    },
    countForBranch(branchId) {
      const bid = branchSlice.normalizeBranchId(branchId);
      let count = 0;
      for (const row of db.prepare('SELECT payload_json FROM attendance').all()) {
        try {
          const payload = JSON.parse(row.payload_json);
          if (branchSlice.recordMatchesBranch(payload, bid)) count += 1;
        } catch { /* skip */ }
      }
      return count;
    },
    getByIdScoped(id, branchId) {
      const row = db.prepare('SELECT payload_json FROM attendance WHERE id = ?').get(String(id));
      if (!row) return null;
      try {
        const payload = JSON.parse(row.payload_json);
        return branchSlice.recordMatchesBranch(payload, branchId) ? payload : null;
      } catch {
        return null;
      }
    },
    getAllForBranch(branchId) {
      const bid = branchSlice.normalizeBranchId(branchId);
      const out = [];
      for (const row of db.prepare('SELECT payload_json FROM attendance').all()) {
        try {
          const payload = JSON.parse(row.payload_json);
          if (branchSlice.recordMatchesBranch(payload, bid)) out.push(payload);
        } catch { /* skip */ }
      }
      return out;
    },
  };
}

function createExpenseRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO expenses (id, date, amount, category, pay_status, branch_id, payload_json, created_at)
    VALUES (@id, @date, @amount, @category, @pay_status, @branch_id, @payload_json, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      date=excluded.date, amount=excluded.amount, category=excluded.category,
      pay_status=excluded.pay_status, branch_id=excluded.branch_id, payload_json=excluded.payload_json
  `);
  return {
    count: () => db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c,
    sumAmount: () => db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM expenses').get().s,
    getAll: () => db.prepare('SELECT payload_json FROM expenses').all().map((r) => JSON.parse(r.payload_json)),
    upsert(record) {
      if (!record?.id) throw Object.assign(new Error('expense_id_required'), { code: 'DB_CONSTRAINT' });
      const amount = Math.max(0, Number(record.amount) || 0);
      upsert.run({
        id: String(record.id),
        date: record.date || null,
        amount,
        category: record.cat || record.category || null,
        pay_status: record.payStatus || null,
        branch_id: record.branchId || null,
        payload_json: JSON.stringify(record),
        created_at: record.createdAt || nowIso(),
      });
      return record;
    },
    replaceAll(list) {
      const tx = db.transaction((items) => {
        const ids = new Set();
        for (const item of items || []) {
          this.upsert(item);
          ids.add(String(item.id));
        }
        for (const row of db.prepare('SELECT id FROM expenses').all()) {
          if (!ids.has(String(row.id))) db.prepare('DELETE FROM expenses WHERE id = ?').run(row.id);
        }
      });
      tx(list);
    },
    replaceBranchSlice(list, branchId) {
      branchSlice.replaceBranchSlice(db, 'expenses', this, list, branchId);
    },
    countForBranch: (branchId) => branchSlice.countForBranch(db, 'expenses', branchId),
    getByIdScoped: (id, branchId) => branchSlice.getByIdScoped(db, 'expenses', id, branchId),
    getAllForBranch: (branchId) => branchSlice.listForBranch(db, 'expenses', branchId),
  };
}

function createKvRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO kv_store(key, value_json, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
  `);
  return {
    get(key, def = null) {
      const row = db.prepare('SELECT value_json FROM kv_store WHERE key = ?').get(key);
      if (!row) return def;
      try { return JSON.parse(row.value_json); } catch { return def; }
    },
    set(key, value) {
      upsert.run(String(key), JSON.stringify(value), nowIso());
    },
    getAllKeys() {
      return db.prepare('SELECT key FROM kv_store').all().map((r) => r.key);
    },
    exportAll() {
      const out = {};
      for (const row of db.prepare('SELECT key, value_json FROM kv_store').all()) {
        try { out[row.key] = JSON.parse(row.value_json); } catch { out[row.key] = null; }
      }
      return out;
    },
  };
}

function createRepositories(db) {
  return {
    clients: createClientRepository(db),
    visits: createVisitRepository(db),
    bookings: createBookingRepository(db),
    employees: createEmployeeRepository(db),
    attendance: createAttendanceRepository(db),
    expenses: createExpenseRepository(db),
    kv: createKvRepository(db),
  };
}

module.exports = {
  createRepositories,
  createClientRepository,
  createVisitRepository,
  createBookingRepository,
  createEmployeeRepository,
  createAttendanceRepository,
  createExpenseRepository,
  createKvRepository,
  branchSlice,
};
