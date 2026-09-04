# PR11 — Owner Lifecycle (Deterministic Single Authority)

## Goal

One deterministic Owner lifecycle: **NEW creates exactly once**; **EXISTING / Restore / Replacement recover only** — no duplicate Owner, no bootstrap create after restore.

## Owner authority

| Layer | Role |
|-------|------|
| **SQLite (via `DB`)** | Operational SoT: `users`, `__tdw_owner_profile__`, `__tdw_owner_lifecycle__`, `__tdw_owner_lifecycle_commit__` |
| **localStorage / legacy** | Compatibility/cache only — never decides create vs recover |
| **`OwnerLifecycleAuthority`** | Lifecycle mode + idempotency + count invariant |
| **`OwnerManagement.getOwnerState()`** | Runtime state machine (NO_OWNER / EXISTS / CORRUPTED / …) |

## Lifecycle modes

- `new` — only path allowed to call `setupCommitOwner` for first Owner
- `existing` — recover / authenticate / reconcile; `createBlocked`
- `restore` — preserve restored Owner ID; `createBlocked`
- `replacement` — hydrate existing Owner on new device; `createBlocked`

## Idempotency strategy

- Key: `owner-create:{orgId}:{usernameLower}`
- Stored in `__tdw_owner_lifecycle_commit__` after successful first-owner commit
- `setupCommitOwner()` → `findCommittedOwner()` short-circuit on retry/restart
- `OwnerManagement.createOwner()` also checks commit record when lifecycle gate active

## Owner count invariant

- One **primary** Owner per organization (profile-linked username)
- Duplicate active owners matching profile → `DUPLICATE_PRIMARY_OWNER`
- `getOwnerState()` → `OWNER_CORRUPTED` (READY blocked)

## Call graphs

### Fresh NEW

```
BootFlow.startPath('new')
  → OwnerLifecycleAuthority.setMode('new')
  → BootFlow.createOwnerFromWizard()
    → OwnerManagement.setupCommitOwner()
      → findCommittedOwner? → return idempotent
      → OwnerManagement.createOwner({ lifecycleCommit: true })
        → OwnerProfile.createProfile + users persist
        → saveCommitRecord()
```

### EXISTING customer

```
BootFlow.startPath('existing')
  → setMode('existing', createBlocked)
  → reconcileExistingCustomer()
    → getPrimaryOwnerRecord → recover (no create)
  → createOwnerFromWizard → EXISTING_NO_CREATE
```

### Restore

```
RestorePostOpen.runPostOpenVerification()
  → OwnerLifecycleAuthority.reconcileAfterRestore()
    → markRestorePreserve
    → assertOwnerCountInvariant
    → preservedOwnerId saved; createBlocked
```

### Replacement device

```
BootFlow sync (EXISTING path)
  → markReplacementHydrate()
  → CloudBootstrap.runNewDeviceBootstrap (hydrate)
  → authenticate existing Owner (no create fallback)
```

## Files changed

| File | Change |
|------|--------|
| `cloud/owner-lifecycle-authority.js` | **New** — lifecycle SoT module |
| `cloud/owner-management.js` | Lifecycle gates on `createOwner`; invariant in `getOwnerState`; export `setupCommitOwner` |
| `cloud/boot-flow-ui.js` | `startPath` sets mode; wizard uses `setupCommitOwner`; EXISTING owner step recover-only |
| `cloud/owner-create-form.js` | Routes first owner through `setupCommitOwner` |
| `cloud/owner-setup-state.js` | `ensureMissingOwner` respects lifecycle when owner in DB |
| `cloud/restore-post-open.js` | Post-restore owner reconcile stage |
| `cloud/owner-bootstrap.js` | Block create when lifecycle blocked |
| `cloud/owner-migration.js` | No shell owner on recover paths; migration gated |
| `index.html` | Load lifecycle script; seed account respects lifecycle |
| `database/sqlite-operational-registry.js` | Register lifecycle KV keys |

## Tests

- `tests/baseline/test-pr11-owner-lifecycle.js` — behavioral suite (NEW once, EXISTING block, restore/replacement, invariant, branch/password stability)
- Full suite via `tests/run-all.js` — existing 119+ tests must remain PASS

## Out of scope (deferred)

- Cloud/Drive renderer pull still uses RecordMerger + LS enqueue/mirror — noted for final hardening round; **not changed in PR11**.

## Remaining risks

- Hub **additional owner** (`additionalOwner: true`) still uses `createOwner` — intentional (role policy unchanged)
- `OwnerBootstrap.redeemSetupToken` still calls `OwnerProfile.createProfile` directly on NEW/token paths (gated by lifecycle block on EXISTING/restore)
- Interactive migration remains for legacy installs with manager account (gated when `isCreateBlocked`)
