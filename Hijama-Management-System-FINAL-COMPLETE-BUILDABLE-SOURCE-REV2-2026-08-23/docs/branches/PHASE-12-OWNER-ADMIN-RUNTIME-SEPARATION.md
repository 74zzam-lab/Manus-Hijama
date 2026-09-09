# PR12 — Owner/Admin Runtime Separation

Policy unchanged — **enforcement only**. UI visibility stays as-is; trusted layer denies forbidden mutations.

## Owner-only operation inventory

| Operation | Service entry | Trusted gate |
|-----------|---------------|--------------|
| Create branch | `BranchEnrollment.enrollBranch` (source=`owner_hub`) | `OwnerTrustedAuthority.assertOwnerMutation` |
| Delete/disable branch | `CenterSetup.removeBranch` | `assertOwnerMutation` |
| Owner Mode / Branch Mode | `OwnerBranchMode.enterBranchMode` | `assertOwnerMutation` |
| Assign additional Owner | `OwnerManagement.createOwner({ additionalOwner })` | `assertOwnerMutation` |
| Update/disable/delete Owner user | `OwnerManagement.updateOwner/deleteOwner/setOwnerActive` | `assertOwnerMutation` |
| Reset Owner password (other user) | `OwnerManagement.resetOwnerPassword` | `assertOwnerMutation` |
| Transfer ownership | `OwnerProfile.transferOwnership` | `assertOwnerMutation` |
| Approve/revoke/transfer device | `DeviceRegistry.*` | `canManageDevicesAsOwner` → `assertOwnerMutation` |
| Deactivate device | `CenterSetup.deactivateDevice` | `assertOwnerMutation` |
| Push/persist license to Drive | `LicenseCloud.pushToDrive` | `assertOwnerOrBootstrap` |
| Wipe persistent license | IPC `app:wipePersistentLicenseData` | rank 5+ owner/hq_admin |
| Bootstrap Owner (token/email) | `OwnerBootstrap.*` | lifecycle + existing PR11 gates |
| OwnerHub mutations | `OwnerHub.requireOwnerManage` | `OperationalRbacGuard.requireOwner` → trusted authority |
| Owner KV SQLite persist | IPC `database:persistKv` | `assertOwnerKvWrite` for owner keys |
| License cache write | IPC `cache:writeLicense` | owner/hq_admin session; no session = bootstrap |

## Role / session authority

| Layer | Source of truth |
|-------|-----------------|
| Renderer session user | `RbacGuard.resolveAuthoritativeUser` — DB `users` record by id |
| IPC session | `rbac:bindSession` — main KV users; rejects tampered role |
| Owner privilege | `RolePolicy.isOrganizationOwner` + lifecycle invariant + sessionEpoch |
| Org scope | `Organization.getId` / license `centerId` must match |
| Branch/device scope | `RbacGuard.requireBranchAccess` + device branch match |

**Session change:** logout clears IPC session; login re-binds from DB — no inherited Owner capability from prior `currentUser.role` string.

## UI vs trusted-layer matrix

| Control | UI (unchanged) | Trusted layer |
|---------|----------------|---------------|
| Owner Hub nav | Hidden unless `OwnerHub.canAccess()` | `requireOwner` on every mutation |
| Branch create button | Owner Hub only | `enrollBranch` + IPC N/A (renderer) |
| Device approve | Owner Hub | `DeviceRegistry` + forged role rejected |
| Settings Owner CTA | Shown per existing rules | Direct API calls still gated |
| Admin manager pages | Visible per preset | Owner-only APIs return `owner_required` |
| License push button | Owner or bootstrap UI | `pushToDrive` + IPC cache write |

## Pages / features matrix (documentation — current policy)

| Page / feature | owner | hq_admin | admin | reception | accountant | employee | custom |
|----------------|-------|----------|-------|-----------|------------|----------|--------|
| Owner Hub | ✅ full | ✅ full | ❌ hidden | ❌ | ❌ | ❌ | ❌ |
| Branch switch (all branches) | ✅ | ✅ | ❌ device lock | ❌ | ❌ | ❌ | per scope |
| Branch create/delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Device approve/revoke | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| License push/wipe | ✅ | ✅ | bootstrap only* | ❌ | ❌ | ❌ | ❌ |
| Dashboard / daily | ✅ | ✅ | ✅ | ✅ | ✅ view | employee page | per matrix |
| Bookings | ✅ | ✅ | ✅ | ✅ | ✅ view | ❌ | per matrix |
| Clients | ✅ | ✅ | ✅ | ✅ | ✅ view | ❌ | per matrix |
| Invoices | ✅ | ✅ | ✅ | ✅ | ✅ view | ❌ | per matrix |
| Messages | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | per matrix |
| Reports | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | per matrix |
| Expenses | ✅ | ✅ | ✅ | ✅ | ✅ view | ❌ | per matrix |
| Attendance | ✅ | ✅ | ✅ | ✅ | ✅ view | ✅ view | per matrix |
| Payroll | ✅ | ✅ | ✅ | ❌ | ✅ view | ❌ | per matrix |
| Employee ledger | ✅ | ✅ | ✅ | ❌ | ✅ pay/export | ❌ | per matrix |
| Inventory | ✅ | ✅ | ✅ | ❌ | ✅ view | ❌ | per matrix |
| Cash float | ✅ | ✅ | ✅ | ✅ | ✅ view | ❌ | per matrix |
| Users manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per matrix |
| Settings | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per matrix |
| Doctors/core | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per matrix |
| Logs | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per matrix |
| Conflict resolve | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | per matrix |

\* Bootstrap: manager/admin may push license only while `!OwnerProfile.hasProfile()` per existing `canBootstrapOwner` policy.

**Permission source:** `ROLE_PRESETS` in `cupping-ext-modules.js`; owner/hq_admin get `_all`; admin gets admin preset; custom uses stored matrix.

## Files changed

- `cloud/owner-trusted-authority.js` — **new** trusted Owner mutation authority
- `cloud/operational-rbac-guard.js` — delegates to trusted authority
- `cloud/branch-enrollment.js`, `device-registry.js`, `center-setup.js`, `owner-branch-mode.js`
- `cloud/owner-management.js`, `owner-profile.js`, `license-cloud.js`
- `electron/rbac-session.js` — `cache:writeLicense`, `assertOwnerKvWrite`
- `electron/main.js` — owner KV persist gate
- `database/operational-rbac-policy.js` — `OWNER_KV_KEYS`, `isOwnerKvKey`

## Tests

- `tests/baseline/test-pr12-owner-admin-runtime-separation.js`
- Full suite: 120+ must remain PASS

## Remaining risks

- Renderer-only paths without service entry (rare direct `DB.set` on license) — mitigated by owner KV IPC gate
- `backup:uploadCloud` remains public for pre-login activation (unchanged policy)
- Hub read-only views for admin not expanded — policy unchanged
