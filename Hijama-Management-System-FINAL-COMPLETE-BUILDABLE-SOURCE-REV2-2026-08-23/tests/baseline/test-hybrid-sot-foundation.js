#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const hybrid = require('../../database/hybrid-schema');
check(Array.isArray(hybrid.MIGRATIONS) && hybrid.MIGRATIONS.length >= 1, 'hybrid MIGRATIONS present');
check(hybrid.CURRENT_SCHEMA_VERSION >= 4, 'CURRENT_SCHEMA_VERSION >= 4');
check(hybrid.isSqliteSotEnabled() === false || process.env.HYBRID_SQLITE_SOT === '1', 'SoT flag default off unless env set');
check(fs.existsSync(path.join(root, 'scripts', 'sqlite-sot-dry-run.mjs')), 'dry-run script present');
check(fs.existsSync(path.join(root, 'cupping-sqlite-bridge.js')), 'dual-run bridge must still exist');

const css = fs.readFileSync(path.join(root, 'renderer', 'styles', 'design-system.css'), 'utf8');
check(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css), 'design-system must not reference Google Fonts CDN');

const updatePolicy = fs.readFileSync(path.join(root, 'electron', 'update-policy.js'), 'utf8');
check(updatePolicy.includes('assertHttps') || updatePolicy.includes('verifyManifestSignature'), 'update-policy fail-closed helpers present');

if (errors.length) {
  console.error('FAIL: hybrid sot foundation');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: hybrid SQLite SoT foundation + design-system CDN-free');
