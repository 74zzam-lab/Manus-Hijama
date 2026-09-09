# V2-5.9 Requirements Traceability

**Ready for release: NO** · **Ready for main: NO** until independent review after Windows Setup EXE PASS.

Result values: `PASS` | `FAIL` | `UNVERIFIED`  
Any `FAIL` / `UNVERIFIED` / `PARTIAL` / `PENDING` / `TODO` / `SKIPPED` / `EXPECTED PASS` → release gate **fails**.

| ID | Requirement | Production files | Automated test | Windows evidence | Result |
|----|-------------|------------------|----------------|------------------|--------|
| R01 | Responsive layouts | design-system + BootFlow | v2-5-9 unit | RESPONSIVE-UAT | UNVERIFIED |
| R02 | Modals scrollable sticky chrome | design-system | v2-5-9 | RESPONSIVE-UAT | UNVERIFIED |
| R03 | Activation grid | design-system | v2-5-9 | RESPONSIVE-UAT | UNVERIFIED |
| R04 | Google login | BootFlow OAuth | prior | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R05 | Auto activation discovery | boot-flow-ui | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R06 | License pull | bootstrap | prior | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R07 | License key activation | BootFlow | prior | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R08 | Org/branches pull | LicenseCloud | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R09 | First branch custom name | BootFlow | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R10 | Device naming + binding | DeviceConfig/Registry | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R11 | Restart applies activation | BootFlow | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R12 | Data source choices | BootFlow restore | v2-5-9 | SYNC-RESTORE-UAT | UNVERIFIED |
| R13 | Cloud restore atomic | OpsUxBridge / V2 | prior | RESTORE-RECONCILIATION-UAT | UNVERIFIED |
| R14 | Initial sync | SyncEngine | v2-5-9 | SYNC-RESTORE-UAT | UNVERIFIED |
| R15 | Sync/backup defaults | ActivationSyncDefaults | v2-5-9 | SYNC-RESTORE-UAT | UNVERIFIED |
| R16 | Device A/B sync | SyncEngine | prior | MULTI-DEVICE-WINDOWS-UAT | UNVERIFIED |
| R17 | No Owner Bootstrap for Google | BootFlow gates | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R18 | Owner seed + forced PW | index.html | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R19 | DevTools Reset Owner Password | developer-panel | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R20 | Owner Hub real actions | owner-hub.js | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R21 | Branch Drawer All Branches | branch-switcher | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R22 | Owner Mode read-only + write context | branch-scope + BranchContexts | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R23 | Approvals in Hub | owner-hub | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R24 | No duplicate activation panels | inventory + BootFlow | v2-5-9 | ACTIVATION-FLOW-UAT | UNVERIFIED |
| R25 | Zero console/runtime errors | — | — | LIVE-WINDOWS-UAT | UNVERIFIED |
| R26 | Windows Setup EXE S1–S6 | — | — | LIVE-WINDOWS-UAT | UNVERIFIED |
| R27 | SQLite SoT + same-tx outbox | cupping-sqlite-bridge, database/service | v2-5-9 | SQLITE-SOT-CUTOVER | UNVERIFIED |
| R28 | No operational dual-write SoT | SqliteBridge.commitOperational | v2-5-9 | SQLITE-SOT-CUTOVER | UNVERIFIED |
| R29 | Atomic branch creation + PENDING | branch-enrollment.js | v2-5-9 | BRANCH-ATOMICITY-UAT | UNVERIFIED |
| R30 | License revision CAS / concurrency | BranchEnrollment.commitLicenseRevision | — | BRANCH-ATOMICITY-UAT | UNVERIFIED |
| R31 | deviceBound / reporting / write contexts split | branch-contexts.js | v2-5-9 | OWNER-HUB-UAT | UNVERIFIED |
| R32 | RBAC deny empty KV; seed then bind | rbac-session + seedUsersIfEmpty | v2-5-4 rbac | RBAC-AUTHORITATIVE-UAT | UNVERIFIED |
| R33 | No renderer claim trust | rbac-session.js | v2-5-4 | RBAC-AUTHORITATIVE-UAT | UNVERIFIED |
| R34 | Mandatory pre-restore + no immediate push | restore-reconciliation.js | v2-5-9 | RESTORE-RECONCILIATION-UAT | UNVERIFIED |
| R35 | Restore pull/reconcile before push | RestoreReconciliation | v2-5-9 | RESTORE-RECONCILIATION-UAT | UNVERIFIED |
| R36 | Backup scope matrix enforced | BACKUP-SCOPE-MATRIX | — | BACKUP-SCOPE-MATRIX | UNVERIFIED |
| R37 | Google Sheets/vault defined + tested | google-sheets-ops | prior | GOOGLE-SHEETS-UAT | UNVERIFIED |
| R38 | Attachments lifecycle | attachment-sync | prior | ATTACHMENTS-UAT | UNVERIFIED |
| R39 | Conflict policy matrix (no blanket LWW) | CONFLICT-POLICY-MATRIX | prior | CONFLICT-POLICY-MATRIX | UNVERIFIED |
| R40 | Near-real-time timings measured | PERFORMANCE-SYNC-PROFILE | — | PERFORMANCE-SYNC-PROFILE | UNVERIFIED |

## Totals

| Metric | Value |
|--------|------:|
| Requirements total | 40 |
| Passed | 0 |
| Failed | 0 |
| Unverified | 40 |
| Unimplemented | Installed Windows Setup EXE Scenarios A–E live proof (code + unit landed; Wine stub ≠ proof) |
