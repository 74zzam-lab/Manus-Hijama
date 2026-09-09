# 04 — License / Branch Activation Flow

## Separation required

| Concern | Where |
|---------|--------|
| Branch management (CRUD) | Owner Hub only |
| Device activation / license pull | Activation UI only |

## Current Hybrid issues

- ~~BranchLock UI still offers **فرع جديد**…~~ **Fixed in V2-3** — selection only.
- ~~Owner Hub `addBranch` bypassed enrollment~~ **Fixed in V2-3** — uses `BranchEnrollment` + `source:'owner_hub'`.
- License pull / Drive bootstrap selects existing branches only (auto first enroll **removed**).

## Target activation UI

1. Authenticate user.
2. Fetch orgs/branches **authorized for this user** from server (Drive interim: signed license doc filtered by membership via `BranchScope.listAuthorizedBranches`).
3. User selects branch — **no create control**.
4. Register/approve Device Binding.
5. Enforce device limit + license status.
6. Issue device token scoped `{organizationId, branchId, deviceId}` (V2-4).
7. Run snapshot bootstrap (V2-6) then open app.
8. Do not store editable “I am Owner” flags as sole authority on client.

## Explicit non-goals

- Creating branches during Google login.
- Treating Google login as Owner proof.
