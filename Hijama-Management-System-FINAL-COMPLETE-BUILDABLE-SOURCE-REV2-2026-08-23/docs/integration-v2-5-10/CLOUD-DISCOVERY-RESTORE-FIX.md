# V2-5.10 — Fast Cloud Discovery & Confirmed Restore Fix

**Date:** 2026-08-03  
**Status:** Engineering fix landed — Scenario C / live Installed EXE retest **required**  
**Production Candidate:** still **NO**

## Root cause

| Field | Finding |
|-------|---------|
| Root cause | BootFlow cloud CTA awaited `OpsUxBridge.openRestoreWizard()` with dialog `z-index:99990` **under** BootFlow overlay `100030`, so confirm never appeared while UI showed `جارٍ الاستعادة من السحابة` indefinitely. No Fast Discovery existed; step claimed auto-detect but did not scan. |
| Operation that consumed 15+ minutes | Waiting on unreachable restore wizard confirm (not a real Drive download loop in that path). |
| Was discovery downloading full backup | **No** on the hung path (wizard never executed). Recursive `listCloudBackups` / `collectBackupFiles` remained a separate risk during license discovery. |
| Was SyncEngine running during discovery | Not on the hung path; SyncEngine could start later via sync step / bootstrap. |
| Duplicate calls found | Cloud click could re-enter while `restoreInFlight` held; wizard + BootFlow both claimed restore UX. |
| Silent catches found | Several empty `catch` around restore/reconcile; cloud path treated wizard return as success even with `skippedExecute: true`. |

## Fix summary

1. **Fast Discovery (≤15s)** — Main IPC `backup:discoverCloudRestorePoints` + renderer `CloudDataDiscovery.discoverAllSources`
   - Google status, center/branch identity, **shallow** Backup folder lists, versions.json **metadata only**
   - Hard overall timeout 15s; per-request ~10s
   - **Forbidden during discovery:** full DB download, attachments, decrypt, decompress, SQLite rebuild, Initial Sync, recursive Drive walk
2. **Confirmed Restore** — explicit button `استعادة هذه البيانات` after card details
3. **Parallel source cards** — cloud / local DB / file / empty-start shown together after discovery
4. **Real progress stages** — 12-stage progress with elapsed time, bytes, diagnostic ID
5. **Locks** — `discoveryLock` / `restoreLock` / operationId stale-result ignore
6. **Z-index** — OpsUx wizard raised to `100050` above BootFlow
7. **Failure safety** — no silent empty DB; preserve license / device / branch messaging on failure
8. **Sync order** — Discover → confirm → restore → reconcile (pull newer) → SyncEngine only on later sync step

## Files changed

| Area | Files |
|------|-------|
| Production services | `electron/cloud-data-discovery.js` (new), `electron/cloud-providers/google-drive.js`, `electron/backup.js`, `electron/main.js`, `electron/preload.js`, `electron/rbac-session.js` |
| UI | `cloud/cloud-data-discovery.js` (new), `cloud/boot-flow-ui.js`, `cloud/ops-ux-bridge.js`, `index.html` |
| Tests | `tests/baseline/test-v2-5-10-cloud-discovery-restore.js`, `tests/run-all.js`, `package.json` |

## Acceptance (engineering)

| Criterion | Offline result |
|-----------|----------------|
| Discovery separated from restore | PASS (code + unit) |
| No full download during discovery | PASS (unit asserts) |
| No Initial Sync during discovery | PASS (unit asserts) |
| Confirm before restore | PASS (CTA wiring) |
| Timeout / retry UI | PASS (timeout status + re-scan button) |
| No infinite loader on cloud click | PASS (path removed) |
| Scenario C on Installed EXE | **UNVERIFIED** — operator must retest |
| Release Gate | still FAIL until A–E |

## Operator retest (Installed Setup EXE)

After next UAT Release publish:

1. Clean install  
2. Reach **مصدر البيانات**  
3. Confirm discovery finishes ≤15s with clear **found / not found / timeout**  
4. If found: details visible **before** download; press **استعادة هذه البيانات**  
5. Progress stages update; cancel/fail preserves local DB  
6. Retest Scenario C from scratch  

## Evidence placeholders (fill after live EXE)

```
No-data discovery time:
One-backup discovery time:
Multiple-backup discovery time:
Restore DB size:
Attachment size:
Download time:
Integrity-check time:
Reconciliation time:
Timeout behavior:
Retry behavior:
Installed Setup EXE:
SHA-256:
Windows version:
Scenario C result: FAIL until retest PASS
```


## Installed Setup EXE (post-fix)

- Release: https://github.com/7uzzam/Tadawi-Clinic-Production/releases/tag/uat-v2-5-10-30817956273
- SHA-256: `db62fd5e3a989d7e7a5c4e6df737626b321d50520a5216d3cf20a379159bbcb5`
- Commit: `8581f0b`
