#!/usr/bin/env node
'use strict';

/**
 * V2-5.9 Windows A-E runtime evidence collector (Release Closure Mode).
 *
 * Scenario order (mandatory):
 *   A Device A/B sync journey
 *   B New Branch atomic
 *   C Disaster Recovery
 *   D Owner Hub / multi-branch
 *   E Google OAuth / Drive / Sheets
 *
 * HARD RULES:
 * - Unit/wiring PASS != Requirement PASS
 * - Installed Setup EXE proof required for Scenario A-E PASS
 * - Wine/NSIS stub (< 50MB) is INVALID installer
 * - Never rewrite REQUIREMENTS-TRACEABILITY to PASS from this script alone
 * - Exit 0 only when HIJAMA_AE_FULL_PROVEN=1 AND all scenario evidence files are PASS
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-9', 'evidence');
const aeDir = path.join(evidenceDir, 'ae-scenarios');
const MIN_SETUP_BYTES = 50 * 1024 * 1024;

fs.mkdirSync(aeDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function writeJson(rel, data) {
  const p = path.isAbsolute(rel) ? rel : path.join(evidenceDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
  return p;
}

function run(rel, timeoutMs) {
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs || 300000,
  });
  return {
    status: r.status,
    signal: r.signal || null,
    stdout: (r.stdout || '').slice(-4000),
    stderr: (r.stderr || '').slice(-2000),
  };
}

function findArtifacts() {
  const distDir = path.join(root, 'dist');
  const productExe = path.join(distDir, 'win-unpacked', 'Hijama Management System.exe');
  let installerPath = process.env.HIJAMA_SETUP_EXE || null;
  if (!installerPath && fs.existsSync(distDir)) {
    const setups = fs
      .readdirSync(distDir)
      .filter((n) => /HijamaManagement-Setup-.*\.exe$/i.test(n))
      .sort();
    if (setups.length) installerPath = path.join(distDir, setups[setups.length - 1]);
  }
  return {
    distDir: fs.existsSync(distDir) ? distDir : null,
    winUnpackedExe: fs.existsSync(productExe) ? productExe : null,
    installerPath: installerPath && fs.existsSync(installerPath) ? installerPath : null,
  };
}

function artifactMeta(p) {
  if (!p || !fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  return {
    path: path.relative(root, p),
    absPath: p,
    size: st.size,
    sha256: sha256File(p),
    mtime: st.mtime.toISOString(),
    validNsisCandidate: st.size >= MIN_SETUP_BYTES,
  };
}

function scenarioStub(id, title, checks) {
  return {
    id,
    title,
    result: 'UNVERIFIED',
    reason: 'REQUIRES_INSTALLED_WINDOWS_SETUP_EXE_LIVE_PROOF',
    checks: checks.map((c) => ({
      name: c,
      result: 'UNVERIFIED',
      evidence: null,
      requiredArtifacts: [
        'windows_runtime_log',
        'artifact_path',
        'sha256',
        'screenshot_or_video',
        'db_counts',
        'hashes',
        'remote_ids_if_any',
        'restart_evidence',
        'failure_recovery_evidence',
      ],
    })),
  };
}

function detectInstalled() {
  if (process.env.HIJAMA_INSTALLED_EXE && fs.existsSync(process.env.HIJAMA_INSTALLED_EXE)) {
    return {
      ...artifactMeta(process.env.HIJAMA_INSTALLED_EXE),
      proof: 'ENV_HIJAMA_INSTALLED_EXE',
    };
  }
  if (process.platform !== 'win32') return null;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Hijama Management System', 'Hijama Management System.exe'),
    path.join(process.env.ProgramFiles || '', 'Hijama Management System', 'Hijama Management System.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Hijama Management System', 'Hijama Management System.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { ...artifactMeta(c), proof: 'PATH_HEURISTIC' };
    }
  }
  return null;
}

function loadJsonIf(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) { /* ignore */ }
  return null;
}

function allScenariosProven(scenarios) {
  return Object.values(scenarios).every((s) => s.result === 'PASS');
}

function main() {
  const startedAt = new Date().toISOString();
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const commitShort = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  const residual = run('tests/baseline/test-v2-5-9-residual-closure.js');
  const unit = run('tests/baseline/test-v2-5-9-final-activation.js');
  const arts = findArtifacts();
  const installerMeta = artifactMeta(arts.installerPath);

  const host = {
    at: startedAt,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    osType: os.type(),
    node: process.version,
    electronPackage: (pkg.devDependencies && pkg.devDependencies.electron) || (pkg.dependencies && pkg.dependencies.electron) || null,
    appVersion: pkg.version,
    commit: (commit.stdout || '').trim(),
    commitShort: (commitShort.stdout || '').trim(),
    cwd: root,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  };

  const installed = detectInstalled();
  const installedJson = loadJsonIf(path.join(evidenceDir, 'windows-installed.json'));
  const smoke = loadJsonIf(path.join(aeDir, 'smoke-launch.json'));
  const cleanProfile = loadJsonIf(path.join(aeDir, 'clean-profile.json'));

  let installedProof = 'MISSING';
  if (installed || (installedJson && installedJson.proof === 'INSTALLED_SETUP_EXE')) {
    installedProof = 'INSTALLED_EXE_FOUND';
  }
  if (process.env.HIJAMA_WINDOWS_INSTALLED === '1' && installedProof === 'INSTALLED_EXE_FOUND') {
    installedProof = 'INSTALLED_SETUP_EXE_ENV';
  }

  const installerValid =
    !!(installerMeta && installerMeta.validNsisCandidate) ||
    !!(process.env.HIJAMA_SETUP_SHA256 && installedProof.startsWith('INSTALLED'));

  const build = {
    at: new Date().toISOString(),
    host,
    installer: installerMeta,
    winUnpacked: artifactMeta(arts.winUnpackedExe),
    distPresent: !!(arts.installerPath || arts.winUnpackedExe),
    installerValidNsis: installerValid,
    minSetupBytes: MIN_SETUP_BYTES,
    installedSetupExeProof: installedProof,
    installed: installed || installedJson || null,
    smoke: smoke || null,
    cleanProfile: cleanProfile || null,
    envSha256: process.env.HIJAMA_SETUP_SHA256 || null,
    note:
      process.platform === 'win32'
        ? 'Windows host - Installed Setup EXE found or missing; A-E live proof still required for Requirement PASS'
        : 'Non-Windows host cannot INSTALL Setup EXE; Wine stubs (<50MB) are INVALID; use GHA windows-2022',
  };

  const scenarios = {
    A_device_ab: scenarioStub('A', 'Device A/B sync journey (BLOCKING)', [
      'device_a_google_login',
      'device_a_license_pull_validate',
      'device_a_branch_initial_sync',
      'device_a_login_crud_attachment_push',
      'device_a_restart_verify',
      'device_b_clean_install',
      'device_b_same_license_branch_pull',
      'device_b_crud_push_restart',
      'conflict_offline_queue_reconnect_resolution',
      'final_verification_zero_runtime_errors',
    ]),
    B_new_branch: scenarioStub('B', 'Atomic new branch', [
      'registry_atomic_creation',
      'branch_context_isolation',
      'device_registration',
      'zero_inherited_operational_data',
      'no_duplicate_branch_device_records',
    ]),
    C_disaster_recovery: scenarioStub('C', 'Disaster recovery', [
      'create_backup',
      'restore_reconcile',
      'restart_resume_sync',
      'verify_ids_counts_attachments',
      'sqlite_integrity_branch_context',
    ]),
    D_owner: scenarioStub('D', 'Owner Hub / multi-branch', [
      'owner_hub_mode_branch_mode',
      'all_branches_reports_approvals',
      'devices_accounts_license_backup_sync',
      'permissions_readonly_branch_switch',
      'restart_no_leakage',
    ]),
    E_google_apis: scenarioStub('E', 'Google OAuth / Drive / Sheets', [
      'oauth_refresh_token',
      'drive_sheets_discovery_read_write_batch',
      'retry_offline_reconnect_restart',
      'account_change_rate_limit_timeout',
      'sheets_role_not_sot_drive_license_validation',
    ]),
  };

  for (const [key, file] of [
    ['A_device_ab', 'A-device-ab.json'],
    ['B_new_branch', 'B-new-branch.json'],
    ['C_disaster_recovery', 'C-disaster-recovery.json'],
    ['D_owner', 'D-owner.json'],
    ['E_google_apis', 'E-google-apis.json'],
  ]) {
    const prior = loadJsonIf(path.join(aeDir, file));
    if (prior && prior.result === 'PASS' && prior.installedSetupExeProof && prior.evidenceComplete === true) {
      scenarios[key] = prior;
    }
  }

  const wiring = {
    residualUnit: residual.status === 0 ? 'PASS' : 'FAIL',
    finalActivationUnit: unit.status === 0 ? 'PASS' : 'FAIL',
    codePathsPresent: {
      noOptimisticOperational: fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8').includes('__noOptimisticOperational'),
      legacyMigration: fs.existsSync(path.join(root, 'cloud/legacy-branch-migration.js')),
      attachmentLifecycle: fs.existsSync(path.join(root, 'cloud/attachment-lifecycle.js')),
      sheetsRoleNotSot: fs.readFileSync(path.join(root, 'cloud/google-sheets-ops.js'), 'utf8').includes('isSourceOfTruth: false'),
      restoreReconciliation: fs.existsSync(path.join(root, 'cloud/restore-reconciliation.js')),
    },
    note: 'WIRING_ONLY - does not flip Requirement rows',
  };

  const runtimeErrors = {
    electronMain: 'UNVERIFIED',
    renderer: 'UNVERIFIED',
    ipc: 'UNVERIFIED',
    sqlite: 'UNVERIFIED',
    outbox: 'UNVERIFIED',
    attachments: 'UNVERIFIED',
    oauth: 'UNVERIFIED',
    sheets: 'UNVERIFIED',
    drive: 'UNVERIFIED',
    license: 'UNVERIFIED',
    restore: 'UNVERIFIED',
    sync: 'UNVERIFIED',
    branchContext: 'UNVERIFIED',
    rbac: 'UNVERIFIED',
    note: 'Fill only from Installed Setup EXE session logs; any unhandled error = Release Blocker',
  };

  const scenariosPass = allScenariosProven(scenarios);
  const fullProven =
    process.env.HIJAMA_AE_FULL_PROVEN === '1' &&
    installedProof.startsWith('INSTALLED') &&
    installerValid &&
    scenariosPass &&
    wiring.residualUnit === 'PASS' &&
    wiring.finalActivationUnit === 'PASS';

  const summary = {
    suite: 'v2-5.9-ae-windows-runtime',
    protocol: 'LIVE-WINDOWS-CLOSURE-PROTOCOL',
    closureMode: true,
    at: startedAt,
    finishedAt: new Date().toISOString(),
    host,
    build,
    wiring,
    scenarios,
    runtimeErrors,
    requirementsPolicy: 'UNVERIFIED until Installed Setup EXE A-E evidence attached per requirement row',
    readyForRelease: fullProven ? 'YES_IF_TRACEABILITY_ALSO_PASS' : 'NO',
    readyForMain: 'NO',
    v259Complete: fullProven ? 'CANDIDATE' : 'NO',
    exitPolicy: {
      '0': 'Installed Setup EXE + all A-E checks PASS with evidence + HIJAMA_AE_FULL_PROVEN=1',
      '1': 'Unit/wiring failure or invalid installer on Windows CI path',
      '2': 'Missing installed Setup EXE proof / scenarios remain UNVERIFIED',
    },
  };

  writeJson('windows-build.json', {
    ok: wiring.residualUnit === 'PASS' && wiring.finalActivationUnit === 'PASS',
    build,
    host,
    unitStatus: unit.status,
    residualStatus: residual.status,
    installerValidNsis: installerValid,
  });
  writeJson('ae-scenarios/summary.json', summary);
  writeJson('ae-scenarios/A-device-ab.json', scenarios.A_device_ab);
  writeJson('ae-scenarios/B-new-branch.json', scenarios.B_new_branch);
  writeJson('ae-scenarios/C-disaster-recovery.json', scenarios.C_disaster_recovery);
  writeJson('ae-scenarios/D-owner.json', scenarios.D_owner);
  writeJson('ae-scenarios/E-google-apis.json', scenarios.E_google_apis);
  writeJson('device-a-uat.json', {
    device: 'A',
    result: 'UNVERIFIED',
    reason: 'REQUIRES_SCENARIO_A_LIVE_PROOF',
    at: new Date().toISOString(),
    distPresent: build.distPresent,
    installed: installedProof,
  });
  writeJson('device-b-uat.json', {
    device: 'B',
    result: 'UNVERIFIED',
    reason: 'REQUIRES_SCENARIO_A_LIVE_PROOF',
    at: new Date().toISOString(),
  });
  writeJson('failure-recovery.json', {
    at: new Date().toISOString(),
    result: 'UNVERIFIED',
    cases: [
      'scenario_a_conflict_offline',
      'scenario_b_branch_creation_pending',
      'scenario_c_restore_reconcile',
      'scenario_d_owner_readonly_leakage',
      'scenario_e_oauth_429_timeout',
    ],
  });

  const markPath = path.join(root, 'docs/integration-v2-5-9/WINDOWS-AE-RUNTIME.md');
  fs.writeFileSync(
    markPath,
    `# V2-5.9 Windows A-E Runtime Status (Release Closure Mode)

Generated: ${summary.finishedAt}

| Field | Value |
|-------|-------|
| Platform | ${host.platform} |
| Commit | ${host.commitShort} |
| GHA run | ${host.githubRunUrl || 'n/a'} |
| Dist present | ${build.distPresent} |
| Installer size | ${build.installer?.size ?? 'MISSING'} |
| Installer valid NSIS (>=50MB) | ${installerValid ? 'YES' : 'NO'} |
| Installer SHA-256 | ${build.installer?.sha256 || build.envSha256 || 'MISSING'} |
| win-unpacked SHA-256 | ${build.winUnpacked?.sha256 || 'MISSING'} |
| Clean profile wipe | ${cleanProfile ? 'RECORDED' : 'MISSING'} |
| Installed Setup EXE proof | ${build.installedSetupExeProof} |
| Scenario A Device A/B | ${scenarios.A_device_ab.result} |
| Scenario B New Branch | ${scenarios.B_new_branch.result} |
| Scenario C Disaster Recovery | ${scenarios.C_disaster_recovery.result} |
| Scenario D Owner | ${scenarios.D_owner.result} |
| Scenario E Google APIs | ${scenarios.E_google_apis.result} |
| Ready for release | **NO** |
| Ready for main | **NO** |
| V2-5.9 complete | **NO** |

## Policy

See \`LIVE-WINDOWS-CLOSURE-PROTOCOL.md\`.
Requirement PASS only after Installed Setup EXE evidence for that row.
Unit/wiring PASS does not flip traceability.
Wine/NSIS stubs under 50MB are **INVALID**.

Do **not** start Scenario B until Scenario A is PASS.
`
  );

  if (residual.status !== 0 || unit.status !== 0) {
    console.error('FAIL: v2-5.9 A-E runtime (unit/wiring)');
    process.exit(1);
  }

  if (fullProven) {
    console.log('V2-5.9 A-E RUNTIME: FULL PROVEN (candidate)');
    process.exit(0);
  }

  console.error('V2-5.9 A-E RUNTIME: UNVERIFIED - Installed Windows Setup EXE A-E live proof required');
  console.log(JSON.stringify({
    platform: host.platform,
    distPresent: build.distPresent,
    installerValidNsis: installerValid,
    installedProof: build.installedSetupExeProof,
    installerSha256: build.installer?.sha256 || build.envSha256 || null,
    installerSize: build.installer?.size || null,
    scenarios: 'UNVERIFIED',
    nextRequired: 'STEP3_SCENARIO_A_DEVICE_AB',
    readyForRelease: 'NO',
  }, null, 2));
  process.exit(2);
}

main();
