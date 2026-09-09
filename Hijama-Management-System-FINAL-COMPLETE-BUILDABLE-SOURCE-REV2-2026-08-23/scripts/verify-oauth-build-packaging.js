#!/usr/bin/env node
/**
 * Phase 15 — OAuth/Drive/Sheets build packaging (auto prebuild like original).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

const bundle = require('../electron/cloud-oauth-production-bundle');
const emb = bundle.decodeProductionBundle();
assert(emb && emb.google?.clientSecret?.startsWith('GOCSPX-'), 'production bundle missing GOCSPX secret');
assert(fs.existsSync(path.join(root, 'electron', 'cloud-oauth.production.b64')), 'cloud-oauth.production.b64 missing');

const gen = spawnSync(process.execPath, ['scripts/generate-oauth-config.mjs', '--strict'], {
  cwd: root,
  encoding: 'utf8',
});
assert(gen.status === 0, 'generate-oauth-config --strict failed');

const configPath = path.join(root, 'electron', 'cloud-oauth.config.json');
const vaultDefaults = path.join(root, 'license', 'license-vault.defaults.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const g = cfg.google || {};
assert(g.clientId && g.clientId.includes('googleusercontent.com'), 'generated config missing clientId');
assert(g.clientSecret && g.clientSecret.startsWith('GOCSPX-'), 'generated config missing GOCSPX secret');
assert(g.scopes?.includes('https://www.googleapis.com/auth/drive.file'), 'drive.file scope missing');

const vault = JSON.parse(fs.readFileSync(vaultDefaults, 'utf8'));
assert(vault.webAppUrl && vault.webAppUrl.includes('script.google.com'), 'license vault webAppUrl missing');
assert(vault.enabled !== false, 'license vault should be enabled by default');

const oauthVerify = spawnSync(process.execPath, ['scripts/verify-google-oauth-config.js'], {
  cwd: root,
  encoding: 'utf8',
});
assert(oauthVerify.status === 0, 'verify-google-oauth-config failed');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = pkg.build?.files || [];
assert(files.includes('electron/cloud-oauth.config.json'), 'package build must include cloud-oauth.config.json');
assert(files.includes('license/**/*'), 'package build must include license vault files');
assert(files.includes('cloud/**/*'), 'package build must include cloud modules');

if (errors.length) {
  console.error('FAIL verify-oauth-build-packaging');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS verify-oauth-build-packaging');
