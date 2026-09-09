#!/usr/bin/env node
/**
 * Code Freeze Gate (Phase 16)
 * Final pre-freeze policy check that consumes FPV/RC outputs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'pat-reports');

const ELECTRON_MANUAL_ITEMS = [
  'installer_branding',
  'first_run_wizard',
  'about_runtime_info',
  'print_58_80_physical',
  'a4_pdf_export',
  'license_management',
  'backup_restore',
  'ledger_month_close',
  'zero_console_errors',
];

function readJson(name) {
  const file = path.join(REPORT_DIR, name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function runRc() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/rc-validation.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });
  return r.status ?? 1;
}

function evaluate(rc) {
  const decision = rc?.rcDecision || 'BLOCKED';
  const blockingFails = Array.isArray(rc?.blockingFails) ? rc.blockingFails : [];
  const rcReady = decision === 'READY_FOR_CODE_FREEZE' && blockingFails.length === 0;
  return {
    rcDecision: decision,
    blockingFails,
    rcReady,
    requiresManualElectronChecklist: true,
    manualChecklistItems: ELECTRON_MANUAL_ITEMS,
    freezePolicy: [
      'No new features',
      'No redesign or large refactors',
      'Only bug/crash/data-loss/print fixes',
    ],
    finalDecision: rcReady ? 'READY_PENDING_MANUAL_ELECTRON' : 'BLOCKED',
  };
}

function writeReport(result) {
  const md = [
    '# Code Freeze Gate Report',
    '',
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**RC decision:** ${result.rcDecision}`,
    `**Final decision:** ${result.finalDecision}`,
    '',
    '## Blocking fails',
    '',
    result.blockingFails.length ? result.blockingFails.map((id) => `- ${id}`).join('\n') : '- none',
    '',
    '## Manual Electron checklist (required)',
    '',
    ...result.manualChecklistItems.map((item) => `- [ ] ${item}`),
    '',
    '## Freeze policy',
    '',
    ...result.freezePolicy.map((line) => `- ${line}`),
    '',
  ].join('\n');

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'CODE-FREEZE-REPORT.md'), md);
  fs.writeFileSync(path.join(REPORT_DIR, 'code-freeze-results.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    ...result,
  }, null, 2));
}

function main() {
  const rcExit = runRc();
  const rc = readJson('rc-results.json');
  const result = evaluate(rc);
  writeReport(result);

  console.log('Code Freeze Gate complete');
  console.log(`  RC: ${result.rcDecision}`);
  console.log(`  Final: ${result.finalDecision}`);
  console.log(`  Blocking fails: ${result.blockingFails.length}`);
  console.log(`  Report: ${path.join(REPORT_DIR, 'CODE-FREEZE-REPORT.md')}`);

  if (rcExit !== 0 || !result.rcReady) {
    process.exit(1);
  }
  process.exit(0);
}

main();
