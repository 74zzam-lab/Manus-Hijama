# 03 — Owner Bootstrap and RBAC

## Current state (Hybrid)

| Piece | Status |
|-------|--------|
| `RolePolicy` owner/hq_admin | Present |
| `OwnerProfile` / `OwnerSetupState` | Present |
| `OwnerHub` UI | Present (managers can **view**; mutate needs org owner) |
| Google login = Owner? | **No** (Drive identity only) |
| Production invitation/token bootstrap | **Missing / incomplete** |
| Codex `createInitialOwnerAccount` | Not ported as the single bootstrap path |

## Target roles

### Owner
Create org; CRUD branches; devices; licenses; users; all-branch reports; restore; cloud sync admin.

### Branch Admin
Operate only authorized branches; **cannot** create branches.

### Employee
Branch-scoped permissions only.

**Google Login = Authentication only, never Authorization.**

## Safe first-Owner paths (choose one for V2-3)

1. **Bootstrap invitation** (preferred): one-time server token emailed to designated Owner.
2. **Pre-provisioned owner email** allowlist on server.
3. **One-time organization setup token** (offline sealed, single use).
4. **Admin-created owner** via License Admin / ops tool.

**Reject:** “first Google account to connect becomes Owner” in production.

## Flow

1. Authenticate (Google/password as designed).
2. Redeem bootstrap token / match pre-provisioned email.
3. Create Organization + Owner membership (server-authoritative).
4. Owner creates first Branch in Owner Hub.
5. Invite users with roles; memberships bind org+branch.
6. Device activation lists **only** authorized branches — no create.

## Enforcement

- Client UI hides create-branch outside Owner Hub.
- Server rejects branch create without Owner role (when backend lands).
- Local license doc mutations must not grant Owner by editing JSON alone (sign/verify / server reconcile).

## Hybrid gaps to close

- ~~Remove BranchLock “فرع جديد” as a general activation create path.~~ **Done (V2-3)**
- ~~Route all branch creates through Owner Hub + `BranchEnrollment` with `source:'owner_hub'`.~~ **Done (V2-3)**
- Narrow Hub **visibility** to Owner for mutate; managers retain read-compatible access until server RBAC (V2-4).
- Production invitation/email allowlist via `OwnerBootstrap` module (local interim); server invitations in V2-4.