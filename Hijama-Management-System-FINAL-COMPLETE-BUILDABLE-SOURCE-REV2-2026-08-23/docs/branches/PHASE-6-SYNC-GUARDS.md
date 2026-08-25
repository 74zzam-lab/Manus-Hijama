# Phase 6 — Sync Guards (empty push, localRev=0, stale overwrite)

**Branch:** `cursor/phase-6-sync-guards-7c71`  
**Parent:** `cursor/phase-5-branch-switch-hardening-7c71`

## Requirement (#7)

Block destructive or incoherent sync:

- **Empty push** — do not upload `[]` over remote data (`empty_push_blocked`)
- **localRev=0** — empty local snapshot cannot push when remote has revision (`local_rev_zero_pull_required`)
- **Stale overwrite** — skip older remote pulls; block pull when pending outbox would be overwritten

## What changed

| File | Change |
|------|--------|
| `database/sync-push-guards.js` | `evaluatePushGuard`, `evaluatePullApplyGuard` |
| `cloud/sync-push-guards.js` | Renderer mirror (`SyncPushGuards`) |
| `cloud/sync-engine.js` | Guards on `pushTable` and `pullOperationalTable` |
| `database/peer-sync-engine.js` | Guard on outbox flush |
| `index.html` | Load `sync-push-guards.js` |

## Verification

```bash
node scripts/verify-sync-guards.js
node tests/baseline/test-v2-4-outbox-dual-device.js
```

## Operator UAT (you)

1. Fresh device with cloud data — push blocked until pull
2. Empty operational export — does not wipe Drive
3. Pending local changes — stale remote pull blocked

## Not in this branch

- Tombstone / idempotency hardening (Phase 7+)
- Attachment authority
