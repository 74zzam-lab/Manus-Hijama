#!/usr/bin/env node
/**
 * Ensure electron/cloud-oauth.config.json exists before packaging.
 * Priority:
 *   1) existing valid config
 *   2) env vars
 *   3) project local override
 *   4) machine store (optional)
 *   5) embedded production defaults (committed for private builds)
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  PROJECT_LOCAL,
  PROJECT_TARGET,
  machineStorePath,
  hasGoogleCreds,
  loadMachineConfig,
  syncMachineToProject,
} from './oauth-machine-store.mjs';

const require = createRequire(import.meta.url);
const { decodeProductionBundle, writeEmbeddedFromBundle } = require('../electron/cloud-oauth-production-bundle.js');

const root = process.cwd();
const target = PROJECT_TARGET;
const localOverride = PROJECT_LOCAL;
const embedded = join(root, 'electron', 'cloud-oauth.embedded.json');
const example = join(root, 'electron', 'cloud-oauth.config.example.json');
const defaults = join(root, 'electron', 'cloud-oauth.defaults.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeConfig(googleCfg, source) {
  let base = { google: {}, onedrive: {}, dropbox: {} };
  if (existsSync(example)) {
    try { base = readJson(example); } catch { /* keep */ }
  }
  base.google = { ...base.google, ...googleCfg };
  writeFileSync(target, JSON.stringify(base, null, 2) + '\n', 'utf8');
  console.log(`✓ cloud-oauth.config.json generated (${source})`);
}

function tryProductionBundle() {
  const emb = decodeProductionBundle();
  if (!emb || !hasGoogleCreds(emb)) return false;
  writeEmbeddedFromBundle();
  writeFileSync(target, JSON.stringify(emb, null, 2) + '\n', 'utf8');
  console.log('✓ cloud-oauth.config.json generated (production bundle)');
  return true;
}

function tryEmbedded() {
  if (!existsSync(embedded)) return false;
  try {
    const emb = readJson(embedded);
    if (hasGoogleCreds(emb)) {
      writeFileSync(target, JSON.stringify(emb, null, 2) + '\n', 'utf8');
      console.log('✓ cloud-oauth.config.json generated (embedded production defaults)');
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

if (existsSync(target)) {
  try {
    if (hasGoogleCreds(readJson(target))) {
      if (process.argv.includes('--verbose')) console.log('✓ cloud-oauth.config.json already configured');
      process.exit(0);
    }
  } catch { /* regenerate */ }
}

const envId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
if (envId && envSecret) {
  writeConfig({
    clientId: envId,
    clientSecret: envSecret,
    redirectPort: parseInt(process.env.GOOGLE_OAUTH_REDIRECT_PORT || '42813', 10)
  }, 'environment variables');
  process.exit(0);
}

if (existsSync(localOverride)) {
  try {
    const local = readJson(localOverride);
    if (hasGoogleCreds(local)) {
      copyFileSync(localOverride, target);
      console.log('✓ cloud-oauth.config.json copied from cloud-oauth.config.local.json');
      process.exit(0);
    }
    const secret = local?.google?.clientSecret;
    const hasSecret = secret && !String(secret).includes('YOUR_') && !String(secret).includes('PASTE_YOUR');
    const def = existsSync(defaults) ? readJson(defaults) : {};
    const clientId = local?.google?.clientId || def?.google?.clientId || (existsSync(example) ? readJson(example)?.google?.clientId : '');
    if (hasSecret && clientId && !String(clientId).includes('YOUR_')) {
      writeConfig({
        ...(def.google || {}),
        ...(local.google || {}),
        clientId,
        clientSecret: secret
      }, 'local secret + defaults');
      process.exit(0);
    }
  } catch { /* fall through */ }
}

if (tryProductionBundle()) process.exit(0);

if (tryEmbedded()) process.exit(0);

const machine = loadMachineConfig();
if (machine) {
  const synced = syncMachineToProject();
  if (synced.ok) {
    console.log(`✓ cloud-oauth.config.json synced from machine store (${machineStorePath()})`);
    process.exit(0);
  }
}

console.error(`
❌ Google OAuth is NOT configured for this build.

Expected committed file:
  electron/cloud-oauth.production.b64
`);

if (process.argv.includes('--strict')) {
  process.exit(1);
}

process.exit(0);
