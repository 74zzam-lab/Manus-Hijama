#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 final consolidation — wiring + module presence checks.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const switcherSrc = fs.readFileSync(path.join(root, 'cloud/branch-switcher.js'), 'utf8');
const migUiSrc = fs.readFileSync(path.join(root, 'cloud/legacy-branch-migration-ui.js'), 'utf8');
const resolverSrc = fs.readFileSync(path.join(root, 'cloud/drive-path-resolver.js'), 'utf8');
const previewSrc = fs.readFileSync(path.join(root, 'cloud/document-preview-bridge.js'), 'utf8');
const initSrc = fs.readFileSync(path.join(root, 'cloud/cloud-v2-init.js'), 'utf8');
const driveMigSrc = fs.readFileSync(path.join(root, 'cloud/drive-migration.js'), 'utf8');

check(/legacy-branch-migration-ui\.js/.test(indexSrc), 'index must load legacy-branch-migration-ui.js');
check(/drive-path-resolver\.js/.test(indexSrc), 'index must load drive-path-resolver.js');
check(/document-preview-bridge\.js/.test(indexSrc), 'index must load document-preview-bridge.js');
check(/package-registry-viewer\.js/.test(indexSrc), 'index must load package-registry-viewer.js');
check(/LegacyBranchMigrationUI\.onOperationalBlocked/.test(indexSrc), 'client save hooks migration UI');
check(/id="doctorModal"/.test(indexSrc) && /doctorModal[\s\S]*modal-body/.test(indexSrc), 'doctorModal uses modal-body');
check(/modal-footer[\s\S]*saveDoctor/.test(indexSrc), 'doctorModal uses modal-footer');

check(/BranchContexts\?\.\s*setOperationalWriteBranch/.test(switcherSrc), 'branch switcher sets operational write branch');
check(/confirmSwitch/.test(switcherSrc), 'branch switcher confirms switch');

check(/openWizard/.test(migUiSrc) && /runMigration/.test(migUiSrc), 'migration UI calls engine');
check(/maybePrompt/.test(migUiSrc), 'migration UI has startup prompt');

check(/operationalFileCandidates/.test(resolverSrc), 'DrivePathResolver operational candidates');
check(/allCenterRoots/.test(resolverSrc), 'DrivePathResolver all center roots');

check(/openPreview/.test(previewSrc) && /printOrPreview/.test(previewSrc), 'DocumentPreviewBridge API');
check(/showThermalReceiptPreview/.test(previewSrc) || /isThermalReceiptHtml/.test(previewSrc),
  'DocumentPreviewBridge routes thermal to receipt modal');

const pkgViewer = fs.readFileSync(path.join(root, 'license/ui/package-registry-viewer.js'), 'utf8');
check(/filterLicenseBuilderPackages/.test(pkgViewer) && /CANONICAL_IDS.*01.*04/s.test(pkgViewer),
  'package viewer exposes 4 customer packages filter');

check(/LegacyBranchMigrationUI\?\.maybePrompt/.test(initSrc), 'cloud-v2-init prompts legacy migration');

check(/DrivePathResolver\?\.allCenterRoots/.test(driveMigSrc), 'drive migration uses DrivePathResolver');

check(fs.existsSync(path.join(root, 'docs/integration-v2-5-10/FINAL-CONSOLIDATION-TRACEABILITY.md')),
  'traceability doc must exist');

if (errors.length) {
  console.error('FAIL test-v2-5-10-final-consolidation');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK test-v2-5-10-final-consolidation —', errors.length === 0 ? 'all checks passed' : '');
