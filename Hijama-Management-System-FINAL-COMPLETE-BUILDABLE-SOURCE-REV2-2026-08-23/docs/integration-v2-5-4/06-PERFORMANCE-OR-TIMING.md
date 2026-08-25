# V2-5.4 — Performance / Timing

RBAC checks are O(1)/O(n-perms) local. IPC session validation must stay synchronous and cheap. No new remote auth round-trips required for Gate B.
