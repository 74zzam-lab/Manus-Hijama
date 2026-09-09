#!/usr/bin/env node
/**
 * Bootstrap Google OAuth credentials for packaging (never commit secrets to GitHub).
 *
 * Resolution order:
 *   1) Valid electron/cloud-oauth.embedded.json (local, may be gitignored)
 *   2) electron/cloud-oauth.config.local.json
 *   3) vendor/cloud-oauth.embedded.json (gitignored drop-in)
 *   4) Final Stage-Clinic-Production.zip (original consolidation bundle)
 *   5) OS machine store (~/.config/NajjarTech or %APPDATA%\\NajjarTech)
 *   6) GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET env
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PROJECT_LOCAL,
  PROJECT_TARGET,
  machineStorePath,
  hasGoogleCreds,
  loadMachineConfig,
  readJson,
} from './oauth-machine-store.mjs';

const root = process.cwd();
const embeddedPath = join(root, 'electron', 'cloud-oauth.embedded.json');
const vendorEmbedded = join(root, 'vendor', 'cloud-oauth.embedded.json');
const zipCandidates = [
  join(root, 'Final Stage-Clinic-Production.zip'),
  join(root, 'vendor', 'Final Stage-Clinic-Production.zip'),
];

const ZIP_EMBEDDED_ENTRY = 'Tadawi-Clinic-Production-cursor-v2-5-10-final-consolidation-cea9/electron/cloud-oauth.embedded.json';

function writeEmbedded(cfg, source) {
  mkdirSync(dirname(embeddedPath), { recursive: true });
  writeFileSync(embeddedPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log(`✓ OAuth embedded bootstrapped (${source}) → electron/cloud-oauth.embedded.json`);
}

function tryExistingEmbedded() {
  if (!existsSync(embeddedPath)) return null;
  try {
    const cfg = readJson(embeddedPath);
    return hasGoogleCreds(cfg) ? cfg : null;
  } catch {
    return null;
  }
}

function tryLocal() {
  if (!existsSync(PROJECT_LOCAL)) return null;
  try {
    const cfg = readJson(PROJECT_LOCAL);
    return hasGoogleCreds(cfg) ? cfg : null;
  } catch {
    return null;
  }
}

function tryVendor() {
  if (!existsSync(vendorEmbedded)) return null;
  try {
    const cfg = readJson(vendorEmbedded);
    return hasGoogleCreds(cfg) ? cfg : null;
  } catch {
    return null;
  }
}

function tryZip() {
  for (const zipPath of zipCandidates) {
    if (!existsSync(zipPath)) continue;
    try {
      const raw = execFileSync('unzip', ['-p', zipPath, ZIP_EMBEDDED_ENTRY], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      const cfg = JSON.parse(raw);
      if (hasGoogleCreds(cfg)) return { cfg, zipPath };
    } catch {
      /* next */
    }
  }
  return null;
}

function tryMachine() {
  const cfg = loadMachineConfig();
  return cfg && hasGoogleCreds(cfg) ? cfg : null;
}

function tryEnv() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  return {
    google: {
      clientId,
      clientSecret,
      projectId: process.env.GOOGLE_OAUTH_PROJECT_ID || 'najjartech-hijama-management',
      redirectPort: parseInt(process.env.GOOGLE_OAUTH_REDIRECT_PORT || '42813', 10),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    },
    onedrive: {},
    dropbox: {},
  };
}

function main() {
  const existing = tryExistingEmbedded();
  if (existing) {
    console.log('✓ OAuth embedded already configured locally');
    return;
  }

  const local = tryLocal();
  if (local) {
    writeEmbedded(local, 'cloud-oauth.config.local.json');
    return;
  }

  const vendor = tryVendor();
  if (vendor) {
    writeEmbedded(vendor, 'vendor/cloud-oauth.embedded.json');
    return;
  }

  const zipHit = tryZip();
  if (zipHit) {
    writeEmbedded(zipHit.cfg, zipHit.zipPath);
    return;
  }

  const machine = tryMachine();
  if (machine) {
    writeEmbedded(machine, machineStorePath());
    return;
  }

  const envCfg = tryEnv();
  if (envCfg) {
    writeEmbedded(envCfg, 'environment variables');
    return;
  }

  console.error(`
❌ Google OAuth credentials not found for build.

Place ONE of:
  • vendor/cloud-oauth.embedded.json  (copy from original; gitignored)
  • electron/cloud-oauth.config.local.json
  • Final Stage-Clinic-Production.zip at repo root (original bundle)
  • Machine store: ${machineStorePath()}
  • Env: GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET

Then re-run: npm run build:prod
`);
  process.exit(1);
}

main();
