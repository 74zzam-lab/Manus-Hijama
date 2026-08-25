#!/usr/bin/env node
/**
 * Post-build validation: ensure production runtime dependencies are packaged
 * and can be required (google-auth-library for Google Drive OAuth).
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const requireFromRoot = createRequire(join(root, 'package.json'));

/** Modules required at runtime in the packaged Electron main process */
const REQUIRED = [
  { name: 'google-auth-library', reason: 'Google Drive OAuth (electron/cloud-providers/google-drive.js)' },
  { name: 'fflate', reason: 'Cloud DB backup ZIP compression' }
];

function findBuildOutput() {
  const candidates = [
    join(distDir, 'win-unpacked', 'resources'),
    join(distDir, 'linux-unpacked', 'resources'),
    join(distDir, 'mac', 'Hijama Management System.app', 'Contents', 'Resources')
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'app.asar')) || existsSync(join(dir, 'app'))) return dir;
  }
  return null;
}

function listAsarFiles(asarPath) {
  try {
    const asar = requireFromRoot('@electron/asar');
    return asar.listPackage(asarPath);
  } catch {
    const out = execFileSync('npx', ['--yes', '@electron/asar', 'list', asarPath], {
      encoding: 'utf8',
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return out.split(/\r?\n/).filter(Boolean);
  }
}

function normAsarPath(line) {
  return String(line || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function moduleInListing(listing, modName) {
  const needle = `node_modules/${modName}/`;
  return listing.some((line) => normAsarPath(line).includes(needle));
}

function asarHasPath(listing, relPath) {
  const needle = normAsarPath(relPath);
  return listing.some((line) => normAsarPath(line) === needle || normAsarPath(line).endsWith('/' + needle));
}

function validateSourceRequire() {
  const errors = [];
  for (const { name } of REQUIRED) {
    const pkgPath = join(root, 'node_modules', name, 'package.json');
    if (!existsSync(pkgPath)) {
      errors.push(`node_modules/${name} missing — run: npm ci`);
      continue;
    }
    try {
      requireFromRoot(name);
    } catch (e) {
      errors.push(`require('${name}') failed in source tree: ${e.message}`);
    }
  }
  return errors;
}

function validatePackagedOutput() {
  const resourcesDir = findBuildOutput();
  if (!resourcesDir) {
    return ['Build output not found under dist/ — run npm run build:dir first'];
  }

  const asarPath = join(resourcesDir, 'app.asar');
  const unpackedDir = join(resourcesDir, 'app.asar.unpacked');
  const errors = [];

  if (!existsSync(asarPath)) {
    return [`app.asar not found at ${asarPath}`];
  }

  const listing = listAsarFiles(asarPath);

  for (const { name, reason } of REQUIRED) {
    const inAsar = moduleInListing(listing, name);
    const inUnpacked = existsSync(join(unpackedDir, 'node_modules', name, 'package.json'));
    if (!inAsar && !inUnpacked) {
      errors.push(`Packaged app missing "${name}" (${reason}) — not in app.asar or app.asar.unpacked`);
    }
  }

  const oauthInAsar = asarHasPath(listing, 'electron/cloud-oauth.config.json');
  const oauthOnDisk = existsSync(join(root, 'electron', 'cloud-oauth.config.json'));
  const electronModules = [
    'electron/clinic-snapshot.js',
    'electron/backup-crypto.js',
    'electron/cloud-oauth-config.js'
  ];
  for (const mod of electronModules) {
    const onDisk = existsSync(join(root, ...mod.split('/')));
    if (!onDisk) {
      errors.push(`Source missing ${mod} — commit file before build`);
      continue;
    }
    if (!asarHasPath(listing, mod)) errors.push(`Packaged app missing ${mod}`);
  }
  if (!oauthInAsar) {
    errors.push('Google OAuth config missing from app.asar (electron/cloud-oauth.config.json) — run: npm run build:prod');
  } else if (oauthOnDisk) {
    console.log('✓ Google OAuth config packaged');
  }

  return errors;
}

const mode = process.argv.includes('--source-only') ? 'source' : 'full';
const errors = [];

if (mode === 'source' || process.argv.includes('--check-source')) {
  errors.push(...validateSourceRequire());
}

if (mode === 'full') {
  errors.push(...validatePackagedOutput());
}

if (errors.length) {
  console.error('\n❌ Production dependency validation FAILED:\n');
  for (const e of errors) console.error(`   • ${e}`);
  console.error(`
Fix checklist:
  1. Ensure dependencies (not devDependencies) in package.json: google-auth-library, fflate
  2. build.files must include node_modules/**/*
  3. Run: npm ci && npm run build:dir
`);
  process.exit(1);
}

console.log('✓ Production dependency validation passed');
for (const { name } of REQUIRED) console.log(`  • ${name}`);
