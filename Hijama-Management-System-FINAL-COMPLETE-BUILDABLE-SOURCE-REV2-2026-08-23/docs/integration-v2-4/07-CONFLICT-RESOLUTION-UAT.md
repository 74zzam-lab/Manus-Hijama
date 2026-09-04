# 07 — Conflict Resolution UAT

## Automated (FileRemote peer)

`tests/baseline/test-v2-4-conflict-resolution.js` — same-record conflict detected; resolve keep_remote; resolution propagates; delete/update surfaces conflict.

**This does NOT close multi-device installed Windows + real Drive conflict UAT.**

## Required runtime (Device A/B installed)

| Scenario | Result |
|----------|--------|
| Same base, both edit, A push, B push → conflict | NOT_STARTED |
| Conflict Center UI shows both snapshots | NOT_STARTED |
| Owner resolve → new revision → both devices | NOT_STARTED |
| Restart with open conflict | NOT_STARTED |
| Duplicate identical change ≠ conflict | Covered partially in peer harness |

## Storage

Prefer `sync_conflicts` over localStorage-only `ConflictQueue` for V2-4 close. Bridge remaining.
