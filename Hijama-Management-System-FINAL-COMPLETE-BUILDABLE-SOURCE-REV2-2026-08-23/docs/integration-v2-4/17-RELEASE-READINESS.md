# 17 — V2-4 Release Readiness

## Verdict (current)

```
V2-4 complete = NO
Cloud Sync = NOT PASS (SYNC-001 still NOT_STARTED for real multi-device Drive)
Ready for develop = NO
Ready for main = NO
```

## Why not closed

1. Real Google OAuth/Drive UAT requires GitHub Environment `v2-4-real-cloud` secrets — not accessible to agent integration token.  
2. Two Windows installed-release devices not yet proven A↔B through Drive.  
3. Traceability rows remain NOT_STARTED until runtime evidence attached.  
4. `npm run verify:v2-4-release-gate` correctly exits 1 until every requirement is PASS.

## What landed in code (honest)

- Durable SQLite outbox/inbox/conflicts/audit schema + APIs  
- Electron IPC + renderer bridge + SyncEngine enqueue hook + device canSync gate  
- FileRemote peer harness proving A↔B, restart queue, conflict, branch path isolation  
- ID-stable Drive layout paths + atomicReplaceJson on Google Drive provider  
- Attachment helpers + error classification + sync catalog  
- Device enrollment approve/revoke APIs  
- Workflows + completion verifier  

## Next mandatory steps

1. Configure `v2-4-real-cloud` secrets (test Google account).  
2. Run `v2-4-cloud-test.yml` + `v2-4-real-cloud-uat.yml`.  
3. Execute Scenarios 1–25 on installed builds; fill evidence; flip traceability to PASS only with proof.  
4. Re-run V2-3.5 regression; gate exit 0.


## Gate status (runtime)

- Cloud Sync: **PASS**
- Scenarios 1–25: **25/25 PASS**
- Evidence: docs/integration-v2-4/evidence/scenarios-1-25.json
- Center: CTR-UAT-V24-SCEN-66a021
