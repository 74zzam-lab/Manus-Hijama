# RC Hotfix Round 1 — Findings & Fixes

**Classification:** `RC HOTFIX / RUNTIME UAT` — not FULL PASS.

## Root causes (pre-fix)

| # | Issue | Root cause | Fix |
|---|--------|------------|-----|
| 1 | Center ID / org name editable on EXISTING | Org step had no `PATHS.EXISTING` branch | EXISTING: read-only confirm-only; NEW: name editable, centerId system |
| 2 | Cloud scan progress vague | Percent = `elapsed/budget` (up to 92%) | Work-based `DISCOVERY_STAGES` + folder ratio + ETA when measurable |
| 3 | 60s timeout too tight | `DISCOVERY_OVERALL_MS=60000` | 150s overall, 180s max; 35s no-progress watchdog |
| 4 | Only newest backup shown | UI bound to `cloud.newest` only | `latestBackups[]` (top 3) + table + select |
| 5 | No discovery summary | No summary object in discovery result | `summary` with orgs/licenses/branches/devices/backups |
| 6 | Sync states ambiguous | Raw `RUNNING` / missing codes in BootFlow | `SyncLifecycle` canonical states + reasons + conflict/outbox |
| 7 | Backup page separate scan | `listBackupV2CloudEntries()` ≠ discovery engine | `runCloudScanForBackupPage()` same contract |
| 8 | No .tdw before migration on existing profile | Migration used `.db` copy only | `PreInstallSafetySnapshot` → one `.tdw` before migrate |

## Wizard step matrix (audit scope)

Both NEW and EXISTING: language → Google → license → organization → branch → data → sync → ready.

Post-fix verification: automated tests + Windows retest checklist in `RC-UAT-RUNBOOK.md`.

## Preserved contracts

PR1–PR13: Owner/Admin policy, Sync CAS, Backup atomicity, branch isolation, restore authority — **unchanged**.
