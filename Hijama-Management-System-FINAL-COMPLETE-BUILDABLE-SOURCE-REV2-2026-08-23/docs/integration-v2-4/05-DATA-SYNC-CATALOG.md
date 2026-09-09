# 05 — Data Sync Catalog

**Source of truth for policies:** `database/table-sync-catalog.js`  
**Automated test:** `tests/baseline/test-v2-4-policies-attachments.js`

| Table | Sync | Branch | Merge | Delete | Conflict | Bucket | PII |
|-------|------|--------|-------|--------|----------|--------|-----|
| clientsRegistry | incremental | yes | field-aware | tombstone | manual-on-overlap | operational | high |
| cases | incremental | yes | append-focused | tombstone | manual-financial | operational | high |
| bookings | incremental | yes | status-time | tombstone | time-status | operational | medium |
| expenses | incremental | yes | revision | tombstone | manual | operational | low |
| attendance | incremental | yes | event-based | tombstone | keep-both-events | operational | medium |
| doctors | incremental | yes | field-aware | tombstone | manual | operational | medium |
| inventoryItems | incremental | yes | revision | tombstone | manual | operational | none |
| inventorySuppliers | incremental | yes | field-aware | tombstone | manual | operational | low |
| inventoryMovements | incremental | yes | append-only | tombstone-only | no-balance-edit | operational | none |
| settings | incremental | yes | owner-admin | forbidden | explicit | configuration | low |
| services | incremental | yes | versioned-config | tombstone | manual | configuration | none |
| packages | incremental | yes | versioned-config | tombstone | manual | configuration | none |
| users | incremental | yes | authorization-sensitive | tombstone | remote-trusted | configuration | high |
| attachments_meta | incremental | yes | content-hash | retention | hash-mismatch | attachments | high |

**Rule:** No blind last-write-wins across all tables. Inventory balances must not be edited in place — movements are append-only.
