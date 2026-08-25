#!/usr/bin/env node
/**
 * One-time OAuth setup:
 *   npm run oauth:save -- --secret=YOUR_GOOGLE_CLIENT_SECRET
 *
 * Saves credentials to a machine-level store (AppData) and syncs into the current project.
 * After that, every build/branch can auto-load secrets without manual file edits.
 */
import { existsSync, writeFileSync, copyFileSync } from 'node:fs';
import {
  PROJECT_LOCAL,
  PROJECT_TARGET,
  PROJECT_EXAMPLE,
  machineStorePath,
  readJson,
  hasGoogleCreds,
  saveMachineConfig,
  loadMachineConfig,
  buildConfigFromSecret,
  syncMachineToProject,
} from './oauth-machine-store.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function main() {
  const secretArg = argValue('secret') || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const clientIdArg = argValue('client-id') || process.env.GOOGLE_OAUTH_CLIENT_ID || '';

  // 1) If secret provided, save machine store + project local
  if (secretArg && !String(secretArg).includes('PASTE_YOUR') && !String(secretArg).includes('YOUR_')) {
    const cfg = buildConfigFromSecret(secretArg, clientIdArg);
    if (!hasGoogleCreds(cfg)) {
      console.error('❌ Missing clientId. Pass --client-id=... or keep example clientId.');
      process.exit(1);
    }
    const machinePath = saveMachineConfig(cfg);
    writeFileSync(PROJECT_LOCAL, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    copyFileSync(PROJECT_LOCAL, PROJECT_TARGET);
    console.log('✓ OAuth saved to machine store');
    console.log(`  ${machinePath}`);
    console.log('✓ Synced into project local + build config');
    console.log('Next builds: npm run build:prod  (no manual edits needed)');
    process.exit(0);
  }

  // 2) If project local already valid, promote it to machine store
  if (existsSync(PROJECT_LOCAL)) {
    try {
      const local = readJson(PROJECT_LOCAL);
      if (hasGoogleCreds(local)) {
        const machinePath = saveMachineConfig(local);
        copyFileSync(PROJECT_LOCAL, PROJECT_TARGET);
        console.log('✓ Existing project local promoted to machine store');
        console.log(`  ${machinePath}`);
        console.log('Next builds: npm run build:prod  (no manual edits needed)');
        process.exit(0);
      }
    } catch { /* fall through */ }
  }

  // 3) If machine store exists, sync into this project/branch
  const synced = syncMachineToProject();
  if (synced.ok) {
    console.log('✓ OAuth loaded from machine store into this project');
    console.log(`  ${synced.machinePath}`);
    console.log('Next builds: npm run build:prod');
    process.exit(0);
  }

  console.error(`
❌ No Google OAuth secret found.

One-time setup (recommended):
  npm run oauth:save -- --secret=YOUR_GOOGLE_CLIENT_SECRET

Or set env vars once for this shell:
  set GOOGLE_OAUTH_CLIENT_ID=...
  set GOOGLE_OAUTH_CLIENT_SECRET=...
  npm run oauth:save

Machine store path:
  ${machineStorePath()}

Example template:
  ${PROJECT_EXAMPLE}
`);
  process.exit(1);
}

main();
