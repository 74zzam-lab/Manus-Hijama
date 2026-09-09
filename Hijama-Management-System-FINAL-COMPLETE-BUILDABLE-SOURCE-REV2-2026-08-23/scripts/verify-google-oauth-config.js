#!/usr/bin/env node
/**
 * Verify Google OAuth config structure (production bundle committed).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const example = path.join(root, 'electron', 'cloud-oauth.config.example.json');
const errors = [];

try {
  const ex = JSON.parse(fs.readFileSync(example, 'utf8'));
  const g = ex.google || {};
  if (!g.clientId || !g.clientId.includes('googleusercontent.com')) errors.push('missing clientId in example');
  if (!g.scopes?.includes('https://www.googleapis.com/auth/drive.file')) errors.push('drive.file scope missing');
  if (g.scopes?.includes('https://www.googleapis.com/auth/drive')) errors.push('full drive scope must not be used');
} catch (e) {
  errors.push(e.message);
}

const drivePaths = require('../electron/cloud-drive-paths');
if (drivePaths.DRIVE_APP_FOLDER !== 'NajjarTech Hijama Management') errors.push('bad folder name');
if (drivePaths.MAIN_BACKUP_FILE !== 'Hijama-Clinic-Backup.tdw') errors.push('bad main file');

const bundle = require('../electron/cloud-oauth-production-bundle');
const emb = bundle.decodeProductionBundle();
try {
  const g = emb?.google || {};
  if (!g.clientId || !g.clientId.includes('googleusercontent.com')) errors.push('bundle missing clientId');
  if (!g.clientSecret || !String(g.clientSecret).startsWith('GOCSPX-')) errors.push('bundle missing GOCSPX secret');
  if (!g.scopes?.includes('https://www.googleapis.com/auth/drive.file')) errors.push('bundle missing drive.file scope');
} catch (e) {
  errors.push('production bundle: ' + e.message);
}

if (!fs.existsSync(path.join(root, 'electron', 'cloud-oauth.production.b64'))) {
  errors.push('cloud-oauth.production.b64 missing');
}

for (const f of ['clinic-snapshot.js', 'backup-crypto.js', 'cloud-oauth-production-bundle.js']) {
  if (!fs.existsSync(path.join(root, 'electron', f))) errors.push('missing electron/' + f);
}

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}
console.log('OK: Google OAuth config structure verified');
console.log('  drive folder:', drivePaths.DRIVE_APP_FOLDER);
