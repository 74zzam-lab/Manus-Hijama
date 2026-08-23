# Phase 9 — Owner / RBAC hardening

**Branch:** `cursor/phase-9-owner-rbac-hardening-7c71`  
**Parent:** `cursor/phase-8-attachments-authority-7c71`

## Requirement (#10)

Harden operational RBAC against forged renderer roles and low-privilege IPC:

- **Authoritative user** — conflict resolve uses DB role, not tampered `currentUser.role`
- **Manager gate** — conflict queue/UI requires manager via `OperationalRbacGuard`
- **Owner gate** — Owner Hub mutations use authoritative owner check
- **Main syncOp** — `resolveConflict`, `requeueDeadLetter(s)`, `metaSet` require admin rank (rank ≥ 4)

## What changed

| File | Change |
|------|--------|
| `database/operational-rbac-policy.js` | Manager/owner ranks; `SYNC_OP_MIN_RANK` map |
| `cloud/operational-rbac-guard.js` | Authoritative manager/owner/conflict gates |
| `electron/rbac-session.js` | `assertSyncOpAllowed` for privileged sync ops |
| `electron/main.js` | Guard `database:syncOp` per operation |
| `cloud/role-policy.js` | `canResolveConflicts` uses authoritative user |
| `cloud/conflict-queue.js` | Manager gate on resolve |
| `cloud/conflict-manager-ui.js` | Authoritative manager check on open |
| `cloud/owner-hub.js` | Owner/bootstrap gates via OperationalRbacGuard |
| `index.html` | Load operational-rbac-guard.js |

## Verification

```bash
node scripts/verify-operational-rbac.js
node tests/baseline/test-v2-5-4-rbac-audit.js
node scripts/verify-attachment-authority.js
```

## Operator UAT (you)

1. Login as reception → conflict manager screen blocked; IPC `resolveConflict` denied in main
2. Tamper `currentUser.role` in DevTools → UI still treats user as reception
3. Owner Hub device delete / branch create → reception denied; owner allowed

## Not in this branch

- Full RBAC inventory re-audit UI
- Error truthfulness (Phase 10+)
- Owner Hub visual polish
