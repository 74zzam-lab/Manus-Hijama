#!/usr/bin/env node
/**
 * Migration: commercial license data 1.0.0 → 1.1.0 / 1.2.0
 * Supports dry-run and rollback.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'license', 'data');
const LICENSE_INDEX = path.join(DATA_DIR, 'license-registry', 'index.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');

const LIC_SECRETS = ['TDW', '2026', 'Hj@', 'مة'];

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function computeRegistrySig(body) {
  const material = LIC_SECRETS.join('|') + '|TADAWI_OFFLINE_LIC_V4';
  const salt = 'TadawiMadina_LIC_SALT_2026';
  const key = crypto.pbkdf2Sync(material, salt, 150000, 32, 'sha256');
  return crypto.createHmac('sha256', key).update(canonicalJson(body)).digest('hex');
}

function withSig(doc) {
  const { registrySig, ...body } = doc;
  return { ...body, registrySig: computeRegistrySig(body) };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const day = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, day, path.basename(filePath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(filePath, dest);
  return dest;
}

function migrateIndex(dryRun) {
  if (!fs.existsSync(LICENSE_INDEX)) {
    console.log('No license index — skip');
    return { ok: true, skipped: true };
  }
  const index = readJson(LICENSE_INDEX);
  const fromVersion = index.registryVersion || '1.0.0';
  if (fromVersion === '1.2.0') {
    console.log('Already at 1.2.0');
    return { ok: true, skipped: true };
  }

  const migrated = withSig({
    ...index,
    registryVersion: '1.2.0',
    migratedFrom: fromVersion,
    generatedAt: new Date().toISOString()
  });

  if (!dryRun) {
    backupFile(LICENSE_INDEX);
    writeJson(LICENSE_INDEX, migrated);
  }

  return { ok: true, from: fromVersion, to: '1.2.0', dryRun };
}

function rollback() {
  const day = new Date().toISOString().slice(0, 10);
  const bak = path.join(BACKUP_DIR, day, 'index.json');
  if (!fs.existsSync(bak)) throw new Error('rollback_backup_missing:' + bak);
  fs.copyFileSync(bak, LICENSE_INDEX);
  return { ok: true, restored: bak };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const doRollback = args.includes('--rollback');

  if (doRollback) {
    const r = rollback();
    console.log('Rollback OK:', r.restored);
    return;
  }

  const result = migrateIndex(dryRun);
  console.log(JSON.stringify(result, null, 2));
}

main();
