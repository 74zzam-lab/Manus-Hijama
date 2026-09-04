# V2-5.9 Sync Architecture (Final Spec)

**Status:** Code cutover in progress · Windows proof **UNVERIFIED** · Ready for release **NO**

## Source of Truth

| Data | SoT | Cache |
|------|-----|-------|
| Operational tables (clients, cases, bookings, expenses, attendance, employees) | **SQLite** | localStorage mirror AFTER commit only |
| Users / settings / packages / services | **SQLite KV** | localStorage mirror after persist |
| UI theme/lang/tab | localStorage only | — |

Write path:

```text
SQLite transaction
→ business record
→ outbox event (same transaction when enqueueAtomicPersistTable)
→ commit
→ UI cache refresh
→ async near-real-time push (polling)
```

If SQLite commit fails → operation NOT saved → NO sync event.

## Sync model

**Near-real-time polling sync** (not WebSocket real-time).

- Push debounce ~2s
- Poll interval ~15s
- Realistic online propagation often 17–30s+

## Branch contexts (separated)

| Context | Meaning |
|---------|---------|
| `deviceBoundBranch` | Permanent device lock |
| `selectedReportingBranch` | Reports / Owner viewing |
| `operationalWriteBranch` | Only context that may write |

## Priority order

1. **Restore reconciliation** (pull newer remote) before any post-restore push  
2. **Continuous Sync** (Config/Operational per branch)  
3. **Local / Cloud Backup** (disaster recovery snapshots — not a sync substitute)

## Post-restore

```text
mandatory pre-restore snapshot
→ staging restore + integrity
→ atomic swap
→ read checkpoint
→ fetch remote manifest
→ pull newer revisions
→ reconcile conflicts
→ push ONLY unsynced local changes
```

**Forbidden:** Restore → immediate Cloud DB push of snapshot revision.

## Google Sheets

License **vault** via Apps Script (`google-sheets-ops.js` / `license-vault-client.js`).  
Not operational SoT. Drive holds branch operational files. Sheets vault = activation/registry integration.  
Conflict: signed Drive `license.json` wins for runtime branch/device list; vault used for key consumption.

## Attachments

Helpers in `database/attachment-sync.js` + Drive path layout. Lifecycle states required:  
PENDING / UPLOADING / SYNCED / FAILED / MISSING_REMOTE / QUARANTINED / DELETED  
Full A/B attachment UAT: **UNVERIFIED**
