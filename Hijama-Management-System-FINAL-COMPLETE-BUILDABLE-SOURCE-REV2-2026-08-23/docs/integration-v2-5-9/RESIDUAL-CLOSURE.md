# V2-5.9 Residual Closure Tracker

| Blocker | Code | Unit | Windows Setup EXE |
|---------|------|------|-------------------|
| Residual optimistic `DB.set` operational cache | REMOVED (`__noOptimisticOperational`, commit-then-cache, restoreLastCommit) | `test-v2-5-9-residual-closure.js` | **UNVERIFIED** (Scenario A) |
| Legacy silent `branchId→BR-MAIN` | Explicit `LegacyBranchMigration` + mapping + push block | same | **UNVERIFIED** (Scenario B) |
| Attachment lifecycle live path | `AttachmentLifecycle` + `attachments-ipc` | same | **UNVERIFIED** (Scenario C) |
| Google Sheets Windows harness | `SHEETS_ROLE` + `simulateHttpFailure` + capability matrix | same | **UNVERIFIED** (Scenario D) |
| Device A/B + branch + DR + Owner | branch-enrollment / restore-reconciliation / BranchContexts | v2-5.9 units | **UNVERIFIED** (Scenario E) |

**Sheets role (official):** `license_registry_integration` — **NOT** Source of Truth.  
Operational SoT = SQLite. Runtime branches/devices = signed Drive `license.json`.  
Vault never overwrites Drive/SQLite ops from a stale/manual spreadsheet.

## Proof tooling

- `npm run v2-5-9:ae` — evidence harness (exit 2 until Installed Setup EXE A–E proven)
- `scripts/windows-uat/Install-And-Prove-V259-AE.ps1` — silent install + smoke on Windows
- GHA `v2-5-9-release-gate.yml` builds real NSIS on `windows-2022`

Ready for release: **NO**  
Ready for main: **NO**  
V2-5.9 complete: **NO**
