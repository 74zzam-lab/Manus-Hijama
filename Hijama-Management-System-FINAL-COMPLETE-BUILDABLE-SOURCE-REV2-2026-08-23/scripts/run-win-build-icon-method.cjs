#!/usr/bin/env node
'use strict';

/**
 * Build Windows with icon Method A (rcedit/signAndEditExecutable) or B (resedit afterPack).
 * method-a: temporarily flip package.json win.signAndEditExecutable=true and clear afterPack.
 * Does not commit changes — restores package.json after attempt.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const method = String(process.argv[2] || 'method-a');
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

function restore() {
  fs.writeFileSync(pkgPath, raw);
}

try {
  if (method === 'method-a') {
    pkg.build.win = pkg.build.win || {};
    pkg.build.win.signAndEditExecutable = true;
    delete pkg.build.afterPack;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('[icon-method] Method A: signAndEditExecutable=true, afterPack removed');
  } else {
    pkg.build.win = pkg.build.win || {};
    pkg.build.win.signAndEditExecutable = false;
    pkg.build.afterPack = './scripts/electron-builder-after-pack.cjs';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('[icon-method] Method B: afterPack/resedit');
  }

  const outDir = path.join(root, 'dist-icon-' + method);
  const args = ['electron-builder', '--win', '--x64', `--config.directories.output=${outDir}`];
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args,
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }
  );
  restore();
  process.exit(result.status == null ? 1 : result.status);
} catch (err) {
  restore();
  console.error(err);
  process.exit(1);
}
