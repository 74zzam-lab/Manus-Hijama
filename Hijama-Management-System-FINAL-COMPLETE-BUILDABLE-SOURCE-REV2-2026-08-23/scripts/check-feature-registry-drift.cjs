#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 — report drift between inline FEATURE_REGISTRY (index.html)
 * and license/registries/feature-registry.json (build-time SoT for packages).
 *
 * Exit 0 always when run as inventory (documents debt).
 * Pass --strict to fail if keys diverge (post-PC unification gate).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const strict = process.argv.includes('--strict');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = index.match(/const FEATURE_REGISTRY\s*=\s*\[([\s\S]*?)\];\s*\nconst ADDON_PAGE_MODULES/);
if (!m) {
  console.error('FAIL: FEATURE_REGISTRY block not found in index.html');
  process.exit(1);
}
const inlineIds = [...m[1].matchAll(/id:\s*'([^']+)'/g)].map((x) => x[1]);
const inlineSet = new Set(inlineIds);

const json = JSON.parse(
  fs.readFileSync(path.join(root, 'license/registries/feature-registry.json'), 'utf8')
);
const jsonKeys = (json.features || []).map((f) => f.key).filter(Boolean);
const jsonSet = new Set(jsonKeys);

const onlyInline = inlineIds.filter((id) => !jsonSet.has(id));
const onlyJson = jsonKeys.filter((k) => !inlineSet.has(k));
const shared = inlineIds.filter((id) => jsonSet.has(id));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  inlineCount: inlineIds.length,
  jsonCount: jsonKeys.length,
  sharedCount: shared.length,
  onlyInline,
  onlyJson,
  note:
    'Dual registries are known Category B residual debt. Runtime UI uses inline FEATURE_REGISTRY; packaging/licensing uses JSON. Unification is post-PC Stage-4 extract — not a UAT blocker.',
};

const outDir = path.join(root, 'docs/integration-v2-5-10/evidence');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'feature-registry-drift.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

console.log('Feature registry drift inventory');
console.log(`  inline: ${report.inlineCount}  json: ${report.jsonCount}  shared: ${report.sharedCount}`);
console.log(`  onlyInline: ${onlyInline.length || '(none)'}`);
if (onlyInline.length) console.log('   ', onlyInline.join(', '));
console.log(`  onlyJson: ${onlyJson.length || '(none)'}`);
if (onlyJson.length) console.log('   ', onlyJson.slice(0, 20).join(', ') + (onlyJson.length > 20 ? '…' : ''));
console.log(`  wrote ${path.relative(root, outPath)}`);

if (strict && (onlyInline.length || onlyJson.length)) {
  console.error('FAIL: --strict and registries diverge');
  process.exit(1);
}
console.log(strict ? 'PASS (strict, no drift)' : 'PASS (inventory; dual registry documented)');
process.exit(0);
