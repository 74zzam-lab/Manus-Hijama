# RBAC Authoritative Binding UAT

| Check | Result |
|-------|--------|
| Empty users KV → DENY (`users_kv_empty`) | CODE + unit |
| `seedUsersIfEmpty` then bind | CODE |
| No renderer claim trust | CODE |
| `skipLookup` ignored for missing users | CODE + unit |
| User disabled | CODE |
| Tampered role | CODE + unit |
| Employee backup IPC denied | CODE + unit |
| Session renderer-only | UNVERIFIED |
| Role downgrade live | UNVERIFIED |
| Device revoked pull | UNVERIFIED |
| Owner write without write branch | CODE (assertOperationalWriteContext) |

Windows: **UNVERIFIED**
