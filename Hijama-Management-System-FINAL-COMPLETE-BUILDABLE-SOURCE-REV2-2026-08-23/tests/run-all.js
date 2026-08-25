#!/usr/bin/env node
'use strict';

/**
 * Unified test runner for Phase 1+.
 * Runs baseline suites first, then existing verify:* critical scripts.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const results = [];

function runNode(relPath, label) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    results.push({ label, ok: false, detail: 'missing file ' + relPath });
    return;
  }
  const r = spawnSync(process.execPath, [abs], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  const ok = r.status === 0;
  let detail = ok
    ? (r.stdout || '').trim().split('\n').slice(-2).join(' | ')
    : ((r.stderr || r.stdout || '') + '').trim().split('\n').slice(-6).join('\n');
  if (!ok && !detail) {
    detail = [
      `exitStatus=${r.status}`,
      `signal=${r.signal || ''}`,
      `spawnError=${r.error ? r.error.message : ''}`,
    ].join(' ');
  }
  results.push({ label, ok, detail });
}

console.log('══ Tadawi Phase-1 Test Runner ══\n');

const baseline = [
  ['tests/baseline/test-entities-finance.js', 'baseline:entities+finance'],
  ['tests/baseline/test-tax-golden.js', 'baseline:tax'],
  ['tests/baseline/test-backup-crypto.js', 'baseline:backup-crypto'],
  ['tests/baseline/test-license-read.js', 'baseline:license-read'],
  ['tests/baseline/test-electron-security-snapshot.js', 'baseline:electron-security'],
  ['tests/baseline/test-phase2-electron-security.js', 'phase2:electron-security'],
  ['tests/baseline/test-phase3-licensing-v6.js', 'phase3:licensing-v6'],
  ['tests/baseline/test-phase4-sqlite.js', 'phase4:sqlite'],
  ['tests/baseline/test-phase6-permissions.js', 'phase6:permissions'],
  ['tests/baseline/test-phase7-backup.js', 'phase7:backup'],
  ['tests/baseline/test-phase8-dev-panel.js', 'phase8:dev-panel'],
  ['tests/baseline/test-phase9-branding-consistency.js', 'phase9:branding-consistency'],
  ['tests/baseline/test-phase10-wizard-tour.js', 'phase10:wizard-tour'],
  ['tests/baseline/test-phase11-booking-statuses.js', 'phase11:booking-statuses'],
  ['tests/baseline/test-phase12-build.js', 'phase12:build'],
  ['tests/baseline/test-phase13-electron-readiness.js', 'phase13:electron-readiness'],
  ['tests/baseline/test-phase14-final-gate.js', 'phase14:final-gate'],
  ['tests/baseline/test-phase15-rc-gate.js', 'phase15:rc-gate'],
  ['tests/baseline/test-phase16-code-freeze-gate.js', 'phase16:code-freeze-gate'],
  ['tests/baseline/test-phase17-release-evidence.js', 'phase17:release-evidence'],
  ['tests/baseline/test-phase18-multibranch-cloud.js', 'phase18:multibranch-cloud'],
  ['tests/baseline/test-phase19-owner-hub.js', 'phase19:owner-hub'],
  ['tests/baseline/test-phase20-production-release.js', 'phase20:production-release'],
  ['tests/baseline/test-phase21-organization-facade.js', 'phase21:organization-facade'],
  ['tests/baseline/test-phase22-owner-policy.js', 'phase22:owner-policy'],
  ['tests/baseline/test-phase23-owner-profile-store.js', 'phase23:owner-profile-store'],
  ['tests/baseline/test-phase24-owner-activation-flag.js', 'phase24:owner-activation-flag'],
  ['tests/baseline/test-phase25-owner-setup-gate.js', 'phase25:owner-setup-gate'],
  ['tests/baseline/test-phase26-device-limits.js', 'phase26:device-limits'],
  ['tests/baseline/test-phase27-owner-hub-device-branch-controls.js', 'phase27:ownerhub-controls'],
  ['tests/baseline/test-phase28-branch-gate.js', 'phase28:branch-gate'],
  ['tests/baseline/test-phase30-owner-branch-mode.js', 'phase30:owner-branch-mode'],
  ['tests/baseline/test-phase31-owner-audit-expansion.js', 'phase31:owner-audit-expansion'],
  ['tests/baseline/test-phase32-ownerhub-licensing-panel.js', 'phase32:ownerhub-licensing-panel'],
  ['tests/baseline/test-phase33-branch-summary-contract.js', 'phase33:branch-summary-contract'],
  ['tests/baseline/test-phase34-nextgen-freeze-gate.js', 'phase34:nextgen-freeze-gate'],
  ['tests/baseline/test-phase35-backup-org-branch-metadata.js', 'phase35:backup-org-branch-metadata'],
  ['tests/baseline/test-phase36-compat-matrix.js', 'phase36:compat-matrix'],
  ['tests/baseline/test-phase37-legacy-owner-migration.js', 'phase37:legacy-owner-migration'],
  ['tests/baseline/test-phase38-nextgen-final-gate.js', 'phase38:nextgen-final-gate'],
  ['tests/baseline/test-phase39-license-drive-push.js', 'phase39:license-drive-push'],
  ['tests/baseline/test-phase39-owner-bootstrap.js', 'phase39:owner-bootstrap'],
  ['tests/baseline/test-phase40-handover-gate.js', 'phase40:handover-gate'],
  ['tests/baseline/test-login-license-ux.js', 'ux:login-license'],
  ['tests/baseline/test-licensing-google-bootstrap-flow.js', 'ux:licensing-google-bootstrap'],
  ['tests/baseline/test-vault-csp-uninstall-wipe.js', 'ux:vault-csp-uninstall-wipe'],
  ['tests/baseline/test-nsis-cupping-center-wipe.js', 'ux:nsis-cupping-center-wipe'],
  ['tests/baseline/test-hybrid-icon-packaging.js', 'hybrid:icon-packaging'],
  ['tests/baseline/test-hybrid-backup-v2.js', 'hybrid:backup-v2'],
  ['tests/baseline/test-backup-v2-cloud-retention.js', 'backup-v2-cloud-retention'],
  ['tests/baseline/test-backup-v2-scope-truth.js', 'backup-v2-scope-truth'],
  ['tests/baseline/test-sqlite-operational-truth.js', 'sqlite-operational-truth'],
  ['tests/baseline/test-transactions-crash-safety.js', 'transactions-crash-safety'],
  ['tests/baseline/test-remove-backup-encryption.js', 'remove-backup-encryption'],
  ['tests/baseline/test-branch-sql-isolation-leakage.js', 'branch-sql-isolation-leakage'],
  ['tests/baseline/test-branch-switch-correctness.js', 'branch-switch-correctness'],
  ['tests/baseline/test-atomic-restore-recovery.js', 'atomic-restore-recovery'],
  ['tests/baseline/test-restore-surface-consolidation.js', 'restore-surface-consolidation'],
  ['tests/baseline/test-pr10-conflict-tombstone-idempotency.js', 'pr10-conflict-tombstone-idempotency'],
  ['tests/baseline/test-pr11-owner-lifecycle.js', 'pr11-owner-lifecycle'],
  ['tests/baseline/test-pr12-owner-admin-runtime-separation.js', 'pr12-owner-admin-runtime-separation'],
  ['tests/baseline/test-pr13-error-truth-migration-safety.js', 'pr13-error-truth-migration-safety'],
  ['tests/backup/backup-restore-v2.test.js', 'v2-5.1:backup-restore-v2'],
  ['tests/backup/backup-sync-harden-v2.test.js', 'v2-5.2:backup-sync-harden'],
  ['tests/baseline/test-v2-5-3-owner-identity-license.js', 'v2-5.3:owner-identity-license'],
  ['scripts/v2-5-3-scenarios-all.cjs', 'v2-5.3:scenarios'],
  ['scripts/windows-uat/v2-5-3-owner-identity-runtime.cjs', 'v2-5.3:windows-uat-runtime'],
  ['tests/baseline/test-v2-5-4-rbac-audit.js', 'v2-5.4:rbac-audit'],
  ['scripts/v2-5-4-scenarios-all.cjs', 'v2-5.4:scenarios'],
  ['scripts/windows-uat/v2-5-4-rbac-runtime.cjs', 'v2-5.4:windows-uat-runtime'],
  ['tests/baseline/test-v2-5-5-performance.js', 'v2-5.5:performance'],
  ['scripts/v2-5-5-scenarios-all.cjs', 'v2-5.5:scenarios'],
  ['scripts/windows-uat/v2-5-5-performance-runtime.cjs', 'v2-5.5:windows-uat-runtime'],
  ['tests/baseline/test-v2-5-6-ux-hardening.js', 'v2-5.6:ux-hardening'],
  ['scripts/v2-5-6-scenarios-all.cjs', 'v2-5.6:scenarios'],
  ['scripts/windows-uat/v2-5-6-ux-runtime.cjs', 'v2-5.6:windows-uat-runtime'],
  ['tests/baseline/test-v2-5-7-production-release.js', 'v2-5.7:production-release'],
  ['scripts/v2-5-7-scenarios-all.cjs', 'v2-5.7:scenarios'],
  ['scripts/windows-uat/v2-5-7-release-runtime.cjs', 'v2-5.7:windows-uat-runtime'],
  ['tests/baseline/test-v2-5-final-stabilization.js', 'v2-5:final-stabilization'],
  ['scripts/v2-5-stabilization-scenarios-all.cjs', 'v2-5:stabilization-scenarios'],
  ['scripts/windows-uat/v2-5-stabilization-runtime.cjs', 'v2-5:stabilization-windows-uat'],
  ['tests/baseline/test-v2-5-8-auth-activation-ui.js', 'v2-5.8:auth-activation-ui'],
  ['tests/baseline/test-v2-5-8-live-owner-validation.js', 'v2-5.8:live-owner-validation'],
  ['tests/baseline/test-v2-5-8-drive-license-pull-recovery.js', 'v2-5.8:drive-license-pull-recovery'],
  ['tests/baseline/test-v2-5-9-final-activation.js', 'v2-5.9:final-activation'],
  ['tests/baseline/test-v2-5-9-residual-closure.js', 'v2-5.9:residual-closure'],
  ['tests/baseline/test-v2-5-10-stage1-backup-v1.js', 'v2-5.10:stage1-backup-v1'],
  ['tests/baseline/test-v2-5-10-stage2-inventory.js', 'v2-5.10:stage2-inventory'],
  ['tests/baseline/test-v2-5-10-cloud-discovery-restore.js', 'v2-5.10:cloud-discovery-restore'],
  ['tests/baseline/test-v2-5-10-setup-state-sync-auth.js', 'v2-5.10:setup-state-sync-auth'],
  ['tests/baseline/test-v2-5-10-setupstate-runtime-proof.js', 'v2-5.10:setupstate-runtime-proof'],
  ['tests/baseline/test-v2-5-10-final-consolidation.js', 'v2-5.10:final-consolidation'],
  ['tests/baseline/test-v2-5-10-production-lock.js', 'v2-5.10:production-lock'],
  ['tests/baseline/test-v2-5-10-production-lock-ux.js', 'v2-5.10:production-lock-ux'],
  ['tests/baseline/test-v2-5-10-category-b.js', 'v2-5.10:category-b'],
  ['tests/baseline/test-rc-hotfix-round1-bootstrap.js', 'rc-hotfix-round1:bootstrap'],
  ['tests/baseline/test-rc-hotfix-round2-restore-auth.js', 'rc-hotfix-round2:restore-auth'],
  ['tests/baseline/test-rc-hotfix-round3-uat-truth.js', 'rc-hotfix-round3:uat-truth'],
  ['tests/baseline/test-rc-hotfix-round4-backup-routing-sync-truth.js', 'rc-hotfix-round4:backup-routing-sync-truth'],
  ['tests/baseline/test-rc-hotfix-round5-bootstrap-restore-auth.js', 'rc-hotfix-round5:bootstrap-restore-auth'],
  ['tests/baseline/test-rc-hotfix-round6-google-hydrate-routing.js', 'rc-hotfix-round6:google-hydrate-routing'],
  ['tests/baseline/test-rc-hotfix-round7-unified-backup-restore.js', 'rc-hotfix-round7:unified-backup-restore'],
  ['tests/baseline/test-rc-hotfix-round7-rbac-bootstrap-restore.js', 'rc-hotfix-round7:rbac-bootstrap-restore'],
  ['tests/baseline/test-license-read-only-all-roles.js', 'license-read-only:all-roles'],
  ['scripts/v2-5-8-scenarios-all.cjs', 'v2-5.8:scenarios'],
  ['scripts/windows-uat/v2-5-8-activation-runtime.cjs', 'v2-5.8:windows-uat'],
  ['tests/baseline/test-hybrid-sot-foundation.js', 'hybrid:sot-foundation'],
  ['tests/baseline/test-hybrid-appointments-v2.js', 'hybrid:appointments-v2'],
  ['tests/baseline/test-font-csp-baseline.js', 'hybrid:font-csp'],
  ['tests/baseline/test-local-qr-baseline.js', 'hybrid:local-qr'],
  ['tests/baseline/test-v2-3-owner-rbac-activation.js', 'v2-3:owner-rbac-activation'],
  ['tests/baseline/test-v2-3-5-migration-failsafe.js', 'v2-3.5:migration-failsafe'],
  ['tests/baseline/test-v2-3-5-uninstall-prep-preserve.js', 'v2-3.5:uninstall-prep-preserve'],
  ['scripts/verify-uninstall-prep.js', 'v2-3.5:verify-uninstall-prep'],
  ['scripts/windows-uat/owner-rbac-runtime.cjs', 'v2-3.5:owner-rbac-runtime'],
  ['tests/baseline/test-v2-4-outbox-dual-device.js', 'v2-4:outbox-dual-device'],
  ['tests/baseline/test-sync-safety-core.js', 'sync-safety-core'],
  ['tests/baseline/test-drive-provider-cas.js', 'drive-provider-cas'],
  ['tests/baseline/test-sync-revision-contract.js', 'sync-revision-contract'],
  ['tests/baseline/test-v2-4-policies-attachments.js', 'v2-4:policies-attachments'],
  ['tests/baseline/test-v2-4-conflict-resolution.js', 'v2-4:conflict-resolution'],
  ['tests/baseline/test-v2-4-large-queue.js', 'v2-4:large-queue'],
  ['tests/baseline/test-v2-4-device-registry.js', 'v2-4:device-registry'],
];

const remediation = [
  ['tests/remediation/test-p0-authority.js', 'remediation:p0-authority'],
  ['tests/remediation/test-ipc-policy-completeness.js', 'remediation:ipc-policy-completeness'],
  ['tests/remediation/test-repository-sqlite-authority.js', 'remediation:repository-sqlite-authority'],
  ['tests/remediation/test-auth-credential-authority.js', 'remediation:auth-credential-authority'],
  ['tests/remediation/test-auth-hydration-truth.js', 'remediation:auth-hydration-truth'],
  ['tests/remediation/test-first-owner-main-authority.js', 'remediation:first-owner-main-authority'],
  ['tests/remediation/test-owner-domain-invalidation.js', 'remediation:owner-domain-invalidation'],
  ['tests/remediation/test-config-authoritative-commit.js', 'remediation:config-authoritative-commit'],
  ['tests/remediation/test-restore-postcommit-truth.js', 'remediation:restore-postcommit-truth'],
  ['tests/remediation/test-backup-local-path-containment.js', 'remediation:backup-local-path-containment'],
  ['tests/remediation/test-backup-retention-classification.js', 'remediation:backup-retention-classification'],
  ['tests/remediation/test-json-migration-quarantine.js', 'remediation:json-migration-quarantine'],
  ['tests/remediation/test-upgrade-resume-truth.js', 'remediation:upgrade-resume-truth'],
  ['tests/remediation/test-sync-outbox-lease.js', 'remediation:sync-outbox-lease'],
  ['tests/remediation/test-sync-version-truth.js', 'remediation:sync-version-truth'],
  ['tests/remediation/test-sync-branch-context-truth.js', 'remediation:sync-branch-context-truth'],
  ['tests/remediation/test-drive-adapter-branch-context-truth.js', 'remediation:drive-adapter-branch-context-truth'],
  ['tests/remediation/test-sync-lifecycle-authoritative-commit.js', 'remediation:sync-lifecycle-authoritative-commit'],
  ['tests/remediation/test-user-merge-protected-fields.js', 'remediation:user-merge-protected-fields'],
  ['tests/remediation/test-branch-identity-fail-closed.js', 'remediation:branch-identity-fail-closed'],
  ['tests/remediation/test-record-metadata-branch-truth.js', 'remediation:record-metadata-branch-truth'],
  ['tests/remediation/test-retired-search-surface.js', 'remediation:retired-search-surface'],
  ['tests/remediation/test-ux-a11y-label-binding.js', 'remediation:ux-a11y-label-binding'],
  ['tests/remediation/test-input-accessibility-labels.js', 'remediation:input-accessibility-labels'],
  ['tests/remediation/test-modal-accessibility-lifecycle.js', 'remediation:modal-accessibility-lifecycle'],
  ['tests/remediation/test-lifecycle-registrar-idempotency.js', 'remediation:lifecycle-registrar-idempotency'],
  ['tests/remediation/test-ui-interaction-foundation.js', 'remediation:ui-interaction-foundation'],
  ['tests/remediation/test-backup-v2-ui-workspace.js', 'remediation:backup-v2-ui-workspace'],
  ['tests/remediation/test-protection-ui-terminology.js', 'remediation:protection-ui-terminology'],
  ['tests/remediation/test-setup-licensing-google-forensic-closure.js', 'remediation:setup-licensing-google-forensic-closure'],
  ['tests/remediation/test-restore-legacy-schema-integrity.js', 'remediation:restore-legacy-schema-integrity'],
  ['tests/remediation/test-restore-bootstrap-missing-center.js', 'remediation:restore-bootstrap-missing-center'],
  ['tests/remediation/test-sync-after-restore-soft-pull.js', 'remediation:sync-after-restore-soft-pull'],
  ['tests/remediation/test-boot-after-restore-local-sync.js', 'remediation:boot-after-restore-local-sync'],
  ['tests/remediation/test-boot-google-after-syncdone.js', 'remediation:boot-google-after-syncdone'],
];

const existing = [
  ['scripts/verify-attendance-policy.js', 'verify:attendance'],
  ['scripts/verify-ledger-monthly.js', 'verify:ledger'],
  ['scripts/verify-tax-invoice.js', 'verify:tax-invoice'],
  ['scripts/verify-backup-sync.js', 'verify:backup-sync'],
  ['scripts/verify-client-import.js', 'verify:client-import'],
  ['scripts/verify-cloud-v2.js', 'verify:cloud-v2'],
];

for (const [file, label] of baseline) runNode(file, label);
for (const [file, label] of remediation) runNode(file, label);
for (const [file, label] of existing) runNode(file, label);

// License suite is ESM
{
  const abs = path.join(root, 'scripts', 'commercial-licensing-test.mjs');
  const r = spawnSync(process.execPath, [abs], { cwd: root, encoding: 'utf8', env: process.env });
  results.push({
    label: 'license:test',
    ok: r.status === 0,
    detail: r.status === 0
      ? (r.stdout || '').trim().split('\n').slice(-2).join(' | ')
      : ((r.stderr || r.stdout || '') + '').trim().split('\n').slice(-8).join('\n'),
  });
}

let failed = 0;
for (const row of results) {
  const mark = row.ok ? 'PASS' : 'FAIL';
  if (!row.ok) failed += 1;
  console.log(`${mark}  ${row.label}`);
  if (!row.ok && row.detail) console.log(row.detail.split('\n').map((l) => '      ' + l).join('\n'));
}

console.log(`\nSummary: ${results.length - failed}/${results.length} passed`);
if (failed) {
  process.exit(1);
}
console.log('All tests passed.');
