# Architecture Assessment

## Is the architecture coherent or overly hybrid?

**Overly hybrid / transitional.** Intent is clear (SQLite ops + Drive license + Sheets vault), but live dual paths remain. Not incoherent — unfinished cutover.

## Direct answers

| Question | Answer |
|----------|--------|
| Is SQLite actually Source of Truth? | **Intended yes for core tables** (`clientsRegistry`, `cases`, `bookings`, `doctors`, `attendance`, `expenses` + operational keys) via `cupping-sqlite-bridge.js` with `__noOptimisticOperational`. **Not exclusive** — localStorage `DB` still exists; fallbacks and non-core keys still use LS. |
| Does localStorage still hold operational data? | **Yes, residual.** Settings/sync meta/conflict queue/attachment fallback/Backup V1 LevelDB world. Risk if operators use V1 backup/restore. |
| Are Drive & Sheets roles clear? | **Yes in code.** Sheets/vault: `isSourceOfTruth: false`, license registry. Drive `license.json`: runtime branches/devices/license. Ops data: SQLite + Drive sync payloads. |
| Are Backup & Sync separate? | **Conceptually yes, operationally muddy.** Sync = incremental ops; Backup V2 = DR snapshot; but Backup V1 + daily JSON layer blur the story. |
| Is Restore safe? | **Designed safe** (`restore-reconciliation.js` blocks immediate push). **Unproven** on Installed EXE; V1 restore is unsafe relative to SQLite SoT. |
| Are Branch contexts separated? | **Yes in code** (`branch-contexts.js`: deviceBound / reporting / write). Live leakage unproven. |
| Is Owner Hub on real paths? | **Yes** — enroll/license/devices/mode call real modules, not stubs. Over-scoped UX. |
| Is RBAC in Main/Service/Repository? | **Main IPC yes**; renderer also re-resolves users. Repository path is transitional. Not purely defense-in-depth everywhere. |
| Attachments lifecycle complete? | **Partial** — states + blob IPC + Drive upload exist; metadata dual-key + live A/B missing. |
| Conflict policies enough? | **Good foundation** (per-table strategies, not blanket LWW). Dual conflict stores weaken operational clarity. |
| Installer lifecycle trustworthy? | **Design strong** (keep data default, explicit wipe). CI smoke PASS; full uninstall matrix still needs human Windows proof. |
| Maintainable long-term? | **Strained.** ~27k-line `index.html`, 86 cloud JS modules, dual persistence, phase-doc sprawl. Direction good; debt high. |

## Target architecture (official)

```
UI (renderer)
  → SqliteBridge / SyncedWrite (ops)
  → Electron IPC (RBAC)
  → better-sqlite3 + sync_outbox
  → SyncEngine → Google Drive (ops JSON + attachment blobs)
License/devices/branches → Drive license.json (signed)
Activation registry only → Sheets/Apps Script vault (NOT SoT)
DR → Backup V2 only
```

Anything outside this should be deprecated.

## Hybrid risk scorecard

| Dual path | Severity |
|-----------|----------|
| SQLite vs localStorage writes | High until cutover complete |
| Backup V1 vs V2 | High |
| Conflict SQLite vs LS queue | Medium |
| Attachment manifest keys | Medium |
| Activation panels | Medium (UX/ops) |
| Feature registry inline vs JSON | Low/Medium |
