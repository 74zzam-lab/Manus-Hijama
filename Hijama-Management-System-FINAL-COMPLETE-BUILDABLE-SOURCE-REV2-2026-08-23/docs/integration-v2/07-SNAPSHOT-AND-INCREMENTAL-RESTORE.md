# 07 — Snapshot and Incremental Restore

## Device activation bootstrap (required)

1. Authenticate  
2. Authorize user for org+branch  
3. Register/approve device  
4. Download latest **valid** branch snapshot  
5. Verify checksum + schema version  
6. Restore into **temporary** DB  
7. Apply incremental server events after snapshot revision  
8. Validate row counts / integrity  
9. Atomically replace local DB  
10. Store sync cursor  
11. Start continuous sync  
12. Open app only with consistent local state  

## Current Hybrid

Drive bootstrap hydrate if files exist — **not** this full pipeline. No guaranteed latest snapshot + incremental apply. Manual Backup V2 restore is DR, not activation bootstrap.

## Implementation notes (V2-6)

- Snapshot format can wrap Backup V2 payload **plus** `revision` metadata.
- Never open UI on empty DB when branch has server snapshot available.
- Offline-first: if server unreachable and local DB exists, open with sync-degraded banner (policy decision).
