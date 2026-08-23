# V2-5.10 — Sync / Activation / Branch UX Fix

## What you should do now

1. Install **only** this Setup EXE:
   - https://github.com/7uzzam/Tadawi-Clinic-Production/releases/tag/uat-v2-5-10-30897392063
   - SHA-256: `b8f3de3ab56179f8aaa4ff8a963f0e46730d27e52daab1714fe5e9a4f66f7a3b`
2. Do **not** disconnect Google when logging out a user — logout no longer clears center Google.
3. If Sync shows paused / old `UNSAFE`:
   - Open **Settings → النسخ والمزامنة → Cloud V2**
   - Press **استئناف المزامنة** then **مزامنة الآن**

## Answers to the reported symptoms

| Symptom | Cause | What to do |
|---------|-------|------------|
| `المتطلبات الناقصة: UNSAFE` | SyncGuard paused after data-state analysis; UI showed raw code | New build maps it to Arabic + **استئناف المزامنة** |
| Activation «لم يفعّل بعد» after license pull | Legacy pulled `license.json` without `activation.consumed` | Label now treats valid pulled center license as activated-for-use |
| أحدث بيانات سحابية = `ipc_missing` | `BackupBridge` missing discovery IPC wrapper | Fixed — discovery uses Electron `discoverCloudRestorePoints` |
| Logout → readiness/restart again | Logout was calling Google disconnect | Fixed — user logout keeps Google connected |
| Branch drawer not filtering instantly | Partial refresh only | Switcher now refreshes clients/staff/reports/active page |
| Password / encryption confusion | Manual encrypt + V2 password required | Default encrypt **off**; V2 key auto-derived if left empty |

## Sync vs Backup (short)

- **مزامنة Cloud V2**: continuous device-to-device operational sync (not disaster recovery).
- **Backup V2**: disaster restore of SQLite (`tadawi.db`) — create / restore from file or schedule.
- **نسخ محلي**: local disk copies on this PC only.
- **Google OAuth**: account link for Cloud V2 + license pull — **not** a LevelDB backup button.

## Honesty

- CI install smoke + unit tests: **PASS**
- Live Device A/B Google journeys: still **operator UNVERIFIED**
- Production Candidate: **NO**
- Baseline score: **58** (unchanged)
