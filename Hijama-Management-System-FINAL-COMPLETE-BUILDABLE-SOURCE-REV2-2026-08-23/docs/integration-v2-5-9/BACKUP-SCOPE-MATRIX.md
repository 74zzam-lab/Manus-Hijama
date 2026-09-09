# Backup Scope Matrix

| Type | Scope | UI label | May restore onto |
|------|-------|----------|------------------|
| Device Full Backup | All local DB on device | نسخة جهاز كاملة | Same center; warn if multi-branch → branch-only device |
| Branch Backup | One `branchId` operational+config | نسخة فرع | Devices bound to that branch |
| Organization Backup | License + all branches metadata (+ optional ops) | نسخة مؤسسة | Owner/admin only |

## Manifest fields (required)

`centerId`, `branchIds[]`, `deviceId`, `backupType`, `schemaVersion`, `createdAt`, `databaseRevision`, `syncCheckpoint`, `attachmentManifest`, `hashes`, `encryption`

## Continuous Sync vs Backup

| Name | Role |
|------|------|
| المزامنة المستمرة | Near-real-time Config/Operational |
| نسخة احتياطية محلية | Local `.tdw` / file |
| نسخة احتياطية سحابية | Cloud DB / V2 upload |
| استعادة نسخة | Staging + reconcile |

Legacy V1/V2 remain internal; UI must use the four Arabic labels above.

Windows enforcement: **UNVERIFIED**
