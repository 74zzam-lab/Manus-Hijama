#!/usr/bin/env node
'use strict';

/**
 * V2-3.5: userdata migration + corrupt DB fail-safe.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..', '..');
const migration = require(path.join(root, 'electron', 'userdata-migration.js'));
const { openDatabase, DatabaseOpenError, integrityCheck } = require(path.join(root, 'database', 'connection.js'));

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-mig-'));
const appData = path.join(tmp, 'AppData');
const canonical = path.join(appData, 'Cupping Center');
const legacy = path.join(appData, 'Hijama Management System');
fs.mkdirSync(path.join(legacy, 'database'), { recursive: true });

const dbPath = path.join(legacy, 'database', 'tadawi.db');
const db = openDatabase(dbPath);
db.prepare(`INSERT INTO meta(key, value) VALUES('migtest','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run();
db.close();

const res = migration.migrateUserDataIfNeeded({
  canonicalRoot: canonical,
  appData,
  localAppData: '',
  log: () => {},
  integrityCheckDb: (p) => {
    const d = openDatabase(p, { failOnCorrupt: true });
    const integ = integrityCheck(d);
    d.close();
    return integ;
  },
});
check(res.ok === true && res.migrated === true, 'migration should copy legacy → canonical');
check(fs.existsSync(path.join(canonical, 'database', 'tadawi.db')), 'canonical db must exist');
check(fs.existsSync(legacy), 'source must remain until confirmed');
check(fs.existsSync(path.join(canonical, migration.MARKER)), 'marker required');

const again = migration.migrateUserDataIfNeeded({
  canonicalRoot: canonical,
  appData,
  localAppData: '',
  log: () => {},
});
check(again.skipped === true, 'second run must skip via marker');

// Corrupt DB must not be silently replaced
const badPath = path.join(tmp, 'bad.db');
fs.writeFileSync(badPath, Buffer.from('not-a-sqlite-file'));
let threw = false;
try {
  openDatabase(badPath, { failOnCorrupt: true });
} catch (err) {
  threw = true;
  check(err instanceof DatabaseOpenError || err.code, 'must throw DatabaseOpenError-like');
  check(fs.existsSync(badPath), 'corrupt file must be preserved');
}
check(threw, 'corrupt open must throw');

fs.rmSync(tmp, { recursive: true, force: true });

if (errors.length) {
  console.error('FAIL: v2-3.5 migration failsafe');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: v2-3.5 migration + corrupt DB failsafe');
