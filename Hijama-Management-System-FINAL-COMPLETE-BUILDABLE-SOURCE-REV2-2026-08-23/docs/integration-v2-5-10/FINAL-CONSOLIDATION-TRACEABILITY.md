# FINAL CONSOLIDATION — Traceability Matrix (V2-5.10)

Branch: `cursor/v2-5-10-final-consolidation-cea9`  
Baseline Overall score: **58** (unchanged)  
Production Candidate: **NO** until Installed Windows Setup EXE A–E + consolidation UAT A–H  
Last code commit referenced: pending this branch push

| # | Requirement | Reuse / existing | Change (this pass) | Automated proof | Installed EXE proof |
|---|-------------|------------------|--------------------|-----------------|---------------------|
| A | Legacy `branchId` migration blocks save/sync | `cloud/legacy-branch-migration.js`, `cupping-sqlite-bridge.js` | `cloud/legacy-branch-migration-ui.js` wizard; settings card; save hook; `cloud-v2-init` prompt | `test-v2-5-10-final-consolidation.js` | **UNVERIFIED** |
| B | Branch contexts + confirmed work-branch switch | `cloud/branch-contexts.js`, `cloud/branch-switcher.js` | Confirm dialog; `BranchContexts.setOperationalWriteBranch`; refresh surfaces | same test (static wiring) | **UNVERIFIED** |
| C | Canonical Drive path resolver | `cloud/drive-layout.js`, `cloud/drive-migration.js` | `cloud/drive-path-resolver.js`; Drive migration scan uses resolver | same test | **UNVERIFIED** |
| D | Discovery / restore + Sync UX | `cloud/cloud-data-discovery.js`, Backup V2, `renderCloudV2BackupStatus` | Legacy branch status in backup card; resume/sync from prior pass | prior `test-v2-5-10-cloud-discovery-restore.js` | **UNVERIFIED** |
| E | Owner → Users (normal setup collapsed) | `cloud/owner-management.js`, `cloud/owner-hub.js` | No duplicate Owner Setup when profile exists (existing gate retained) | `test-phase37-legacy-owner-migration.js` | **UNVERIFIED** |
| F | Employee modal responsive shell | `renderer/styles/design-system.css` `.modal-shell` | `#doctorModal` → `modal-body` + `modal-footer` | design-system CSS + manual | **UNVERIFIED** |
| G | Feature / package registry (4 packages + viewer) | `FEATURE_REGISTRY`, `license/registries/package-registry.json` | `license/ui/package-registry-viewer.js` | same test | **UNVERIFIED** |
| H | Direct print → unified preview path | `openReportPreview`, `reportPreviewModal` | `cloud/document-preview-bridge.js`; optional thermal preview in `printThermalDoc` | same test | **UNVERIFIED** |

## Honesty board

| Gate | Status |
|------|--------|
| `npm test` | Pending CI on push |
| Windows install smoke | Pending CI |
| Live Google Device A/B UAT | **UNVERIFIED** (operator) |
| Production Candidate | **NO** |
| Release gate A–E | **FAIL** (no new EXE proof) |

## Operator notes

- If client save shows `legacy_branch_migration_required`: **الإعدادات → Cloud V2 → معالج ترحيل branchId** or wizard auto-prompt after login.
- After merge to `main`, wait for CI UAT EXE release tag `uat-v2-5-10-<run_id>` before claiming any PASS.
