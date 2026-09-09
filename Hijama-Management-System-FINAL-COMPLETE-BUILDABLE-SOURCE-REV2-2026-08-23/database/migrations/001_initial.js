'use strict';

/**
 * Initial SQLite schema for Tadawi (Phase 4).
 * Core operational data + KV for settings/counters/local-only blobs.
 */
module.exports = {
  version: 4,
  id: '001_initial',
  sql: `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  file_no TEXT,
  key TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  patient_id TEXT,
  nationality TEXT,
  is_vip INTEGER NOT NULL DEFAULT 0,
  default_invoice_type TEXT,
  branch_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  revision INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  invoice TEXT,
  client_id TEXT,
  doctor_id TEXT,
  date TEXT,
  service_type TEXT,
  cups REAL,
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  pre_tax REAL,
  vat REAL,
  cash REAL,
  card REAL,
  commission REAL,
  branch_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  revision INTEGER DEFAULT 1,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS visit_cups (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  zone TEXT,
  count REAL,
  notes TEXT,
  payload_json TEXT,
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  visit_id TEXT,
  invoice_number TEXT,
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  pre_tax REAL,
  vat REAL,
  payload_json TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY (visit_id) REFERENCES visits(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL DEFAULT 0,
  payload_json TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT,
  visit_id TEXT,
  method TEXT,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payload_json TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  doctor_id TEXT,
  date TEXT NOT NULL,
  time TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  service TEXT,
  branch_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  salary REAL DEFAULT 0 CHECK (salary >= 0),
  branch_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT,
  total_hours REAL,
  payload_json TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  payload_json TEXT,
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  net_total REAL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (period_id) REFERENCES payroll_periods(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  visit_id TEXT,
  amount REAL NOT NULL DEFAULT 0,
  payload_json TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  category TEXT,
  pay_status TEXT,
  branch_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practitioners (
  id TEXT PRIMARY KEY,
  name TEXT,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  role TEXT,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT,
  permission_key TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id TEXT,
  path TEXT,
  mime TEXT,
  payload_json TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_file_no ON clients(file_no);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
CREATE INDEX IF NOT EXISTS idx_visits_invoice ON visits(invoice);
CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
`
};
