# V2-5.8 Current Reality

Fragmented Google/license/branch/owner UIs consolidated into BootFlow V2-5.8 wizard.
Duplicate login/license Google panels hidden. Owner password mandatory (min 8).
Dashboard gated until activation complete.

Owner State Machine (Single Source of Truth):
`OwnerManagement.getOwnerState()` → NO_OWNER | OWNER_EXISTS | OWNER_CORRUPTED | OWNER_RECOVERY_REQUIRED | OWNER_CREATION_IN_PROGRESS
→ `requestOwnerBootstrap()` / `createOwner()` (single lock) → Owner Hub refresh → Emergency Recovery only for repairs.

Owner creation paths (self-healing):
1. **Method 1 (primary):** BootFlow → Google → License → Organization → Owner Bootstrap
2. **Method 2 (automatic):** `getOwnerState() === NO_OWNER` → `requestOwnerBootstrap()` (restore/migration/transfer/upgrade/rebinding)
3. **Method 3 (emergency only):** Developer Tools → Owner Emergency Recovery

Day-to-day Owner CRUD after first Owner: **Owner Hub** (same `createOwner()`).
Live production close blocked until `LIVE-PRODUCTION-SMOKE.md` is fully exercised on installed Windows Setup EXE.
