#!/usr/bin/env node
/**
 * Verify Electron build devDependencies are installed (Windows-safe).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const required = [
  { path: 'node_modules/electron-builder/cli.js', label: 'electron-builder', kind: 'dev' },
  { path: 'node_modules/electron/cli.js', label: 'electron', kind: 'dev' },
  { path: 'node_modules/google-auth-library/package.json', label: 'google-auth-library', kind: 'prod' },
  { path: 'node_modules/fflate/package.json', label: 'fflate', kind: 'prod' },
  { path: 'node_modules/xlsx/dist/xlsx.full.min.js', label: 'xlsx', kind: 'prod' }
];

const missing = required.filter((r) => !existsSync(join(root, r.path)));

if (missing.length) {
  console.error('\n❌ Build dependencies missing:\n');
  for (const m of missing) console.error(`   - ${m.label}`);
  console.error(`
Fix (run in project folder):

  npm install --include=dev

If you used production install before, run:

  npm ci --include=dev

Or:

  set NODE_ENV=development
  npm install

Then retry:

  npm run build
`);
  process.exit(1);
}

if (process.argv.includes('--verbose')) {
  console.log('✓ electron-builder, electron, and production runtime deps are installed');
}

// Verify require() works for packaged runtime modules
try {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/validate-production-deps.mjs', '--source-only'], {
    cwd: root,
    stdio: 'inherit'
  });
} catch {
  process.exit(1);
}
