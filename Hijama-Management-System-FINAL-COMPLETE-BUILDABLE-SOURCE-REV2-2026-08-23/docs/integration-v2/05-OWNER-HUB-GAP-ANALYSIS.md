# 05 — Owner Hub Gap Analysis

| Feature | Hybrid classification |
|---------|----------------------|
| Organization overview cards | **Implemented** (local + Drive status) |
| Branch CRUD | **Local-only** (license doc); ID scheme inconsistent with enrollment |
| Branch enable/disable | **Implemented** (local) |
| Device list / revoke | **Implemented** (local license/device registry) |
| Device transfer | **Partial / Missing** |
| License allocation | **Partial** (license.json push) |
| User invitations | **Missing** (server) |
| Role management | **Partial** (local users + RolePolicy) |
| Branch reports | **Partial** (`BranchSummary`) |
| Consolidated org reports | **Missing / deferred** in Hybrid copy |
| Last sync time / sync health | **Implemented** (Drive SyncEngine diagnostics) |
| Backup status | **Partial** (Backup V2 / BackupLayer) |
| Restore action (branch) | **Missing** (Codex has `branch-restore.js`) |
| Audit log | **Partial** (local audit events) |
| Server-authoritative org graph | **Requires backend** |

## Summary

Owner Hub is a **real local/Drive control panel**, not a pure mock — but it is **not** a multi-tenant backend Owner Console. V2-5 must re-home mutations to server APIs while keeping UX.
