# Phase 8 — Attachments metadata authority

**Branch:** `cursor/phase-8-attachments-authority-7c71`  
**Parent:** `cursor/phase-7-conflict-tombstone-idempotency-7c71`

## Requirement (#9)

Unify attachment metadata under synced `attachments_meta` (RB-05):

- **Canonical table** — `attachments_meta` replaces split `__tdw_attachment_manifest__` wrapper for sync/outbox
- **Legacy migrate** — read legacy manifest → populate `attachments_meta` on first load
- **Branch authority** — writes blocked when item `branchId` ≠ active write branch
- **Hash authority** — upload path verifies SHA-256 before `SYNCED` state
- **Duplicate hash** — same `sha256` + branch returns existing item (no duplicate meta rows)

## What changed

| File | Change |
|------|--------|
| `database/attachment-authority.js` | Node helpers: migrate, branch gate, hash verify |
| `cloud/attachment-authority.js` | Renderer SoT for `attachments_meta` |
| `cloud/attachment-lifecycle.js` | Persist via AttachmentAuthority (not manifest KV alone) |
| `cloud/repository.js` | `attachments_meta` in `SYNCED_TABLES` |
| `cloud/sync-engine.js` | Operational sync layer for `attachments_meta` |
| `cloud/operational-layer.js` | Export path `attachments-meta.json` |
| `cloud/table-merge-policy.js` | Strict conflict on `sha256` |
| `cupping-sqlite-bridge.js` | `attachments_meta` in KV mirror |
| `index.html` | Load `attachment-authority.js` before lifecycle |

## Verification

```bash
node scripts/verify-attachment-authority.js
node tests/baseline/test-v2-4-policies-attachments.js
node scripts/verify-tombstone-idempotency.js
node tests/baseline/test-v2-4-outbox-dual-device.js
```

## Operator UAT (you)

1. Add attachment on device A → metadata appears in sync; device B pull shows same `sha256` + filename
2. Switch branch → attachment list scoped to active branch only
3. Legacy clinic with old manifest → first open migrates to `attachments_meta` without losing files

## Not in this branch

- Live Drive A/B blob upload UAT (still operator)
- Owner/RBAC hardening (Phase 9+)
- Attachment UI redesign
