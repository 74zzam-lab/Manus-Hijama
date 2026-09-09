# 04 — Owner Hub End-to-End UAT

**Status:** PARTIAL (local V2-3.5 proven; remote peer persistence for V2-4 NOT fully proven)

## Local baseline (must not regress)

Owner bootstrap, RBAC, branch enrollment source checks — see `docs/integration-v2/` Owner RBAC evidence.

## V2-4 additions implemented in code

| Capability | Production path | Runtime A↔B evidence |
|------------|-----------------|----------------------|
| Device enrollment pending | `cloud/device-registry.js` `requestEnrollment` | NOT_STARTED |
| Approve/revoke device | `approveDevice` / `revokeDevice` | NOT_STARTED |
| Sync blocked when revoked | `DeviceRegistry.canSync` + `SyncEngine.checkSyncGuard` | Unit path pending dedicated test |
| Branch create → Drive license.json | Owner Hub + LicenseCloud.pushToDrive | Needs real Drive |
| Remote Hub aggregates after sync | Owner Hub UI | NOT_STARTED |

## Required scenarios (all must PASS for close)

1. Bootstrap owner + center + branches → restart → remote matches local  
2. Device B enrollment → Owner approve → branch select → initial sync  
3. Owner creates/renames/disables branch → Device B sees after sync  
4. Revoke B → sync blocked → local DB preserved  
5. Employee cannot open Owner Hub (UI+IPC+service)

**Result overall:** NOT_STARTED for multi-device installed release.
