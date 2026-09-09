# Conflict Policy Matrix

| Entity | Mergeable | Non-mergeable | Delete vs Update | Manual approval | LWW allowed? |
|--------|-----------|---------------|------------------|-----------------|--------------|
| settings (non-financial) | overlapping keys via MergePolicy | identity fields | prefer update tombstone review | optional | yes (config only) |
| services / packages / prices | non-overlapping fields | id, branchId | enqueue | optional | limited |
| clientsRegistry | name/phone non-overlap | id, fileNo, branchId | enqueue | if fileNo clash | no for fileNo |
| cases / visits | notes | invoice#, payment status, totals | **manual** | **required** | **NO** |
| bookings | schedule notes | status transitions | enqueue | status clash | no |
| expenses | notes | amount, approved | **manual** | **required** | **NO** |
| attendance | — | punch times | **manual** | **required** | **NO** |
| users / roles | display name | password hash, role, branchScope | **manual** | **required** | **NO** |
| license / devices | — | all | **manual** | **required** | **NO** |

Implementation: `RecordMerger` + `ConflictQueue` + SQLite `sync_conflicts`.  
Windows conflict UAT: **UNVERIFIED**
