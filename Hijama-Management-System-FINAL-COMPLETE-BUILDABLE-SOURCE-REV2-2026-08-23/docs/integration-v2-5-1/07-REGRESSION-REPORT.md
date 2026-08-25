# V2-5.1 — Regression Report

**Status:** PASS  
**Baseline:** V2-4 tip `427f1a4`  
**V2-5.1 commits:** `470588a` → `3a1ed06` → `4185bc4`+

## Results

| Check | Result |
|-------|--------|
| `npm test` | 71/71 PASS |
| `npm run verify:v2-4-release-gate` | PASS (223/223) |
| CSP / local fonts / local QR | unchanged (hybrid font/qr baselines still in npm test) |
| Cloud sync core | no intentional edits to peer-sync/outbox in this phase |

## Risk notes addressed

- Dual-stack: Backup V2 UI labeled as SQLite DR; legacy LevelDB path retained.
- Identity gate fail-closed when live binding present.
- Scheduler starts disabled-by-config by default (`enabled: false` until configured).
