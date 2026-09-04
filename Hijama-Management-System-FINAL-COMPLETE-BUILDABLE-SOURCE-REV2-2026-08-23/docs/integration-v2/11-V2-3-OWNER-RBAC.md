# 11 — V2-3 Owner Bootstrap & RBAC (implementation)

**Branch:** `integration/hybrid-cloud-owner-v2`  
**Depends on:** V2-2 persistence (do not ship cloud features before Windows UAT of V2-2)

## Changes

| Area | Change |
|------|--------|
| `cloud/branch-lock-ui.js` | Selection-only; removed **فرع جديد** / first-branch create; empty state → Owner Hub |
| `cloud/branch-enrollment.js` | **All** enrolls require `source:'owner_hub'` (including first) |
| `cloud/owner-hub.js` | `addBranch` uses `BranchEnrollment.enrollBranch(..., { source:'owner_hub' })` |
| `index.html` | Removed auto-enroll in `applyDriveBootstrapDeviceLock`; empty branch list error; load `owner-bootstrap.js` |
| `cloud/center-setup-ui.js` | Copy + gates; create routed to Owner Hub; mutate = Owner only |
| `cloud/role-policy.js` | Added `canCreateBranches` (Owner/hq_admin/dev only) |
| `cloud/branch-scope.js` | Added `listAuthorizedBranches` |
| `cloud/owner-bootstrap.js` | **New** — token / pre-provisioned email; `googleLoginImpliesOwner() === false` |

## Policy enforced

- Google Login ≠ Owner authorization.
- Branch Admin (`admin`) cannot create branches.
- Device activation lists authorized branches only.
- First branch created only via Owner Hub.

## Tests

- Updated: `test-phase28-branch-gate.js`, `test-phase22-owner-policy.js`, `test-phase27-…`, `verify-cloud-v2.js`
- Added: `tests/baseline/test-v2-3-owner-rbac-activation.js`

## Still deferred (V2-4+)

- Server-authoritative invitations / device tokens
- Full Owner Hub backend org directory
- Automatic snapshot bootstrap (V2-6)
