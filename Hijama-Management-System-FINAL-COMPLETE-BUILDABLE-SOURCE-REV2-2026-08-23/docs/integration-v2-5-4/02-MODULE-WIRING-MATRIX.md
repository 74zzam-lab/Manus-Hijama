# V2-5.4 — Module Wiring Matrix

| Module | Status | Notes |
|--------|--------|-------|
| RbacInventory | WIRED | snapshot evidence |
| RbacGuard | WIRED | authoritative resolve + deny audit |
| BranchScope assertWriteAllowed | HARDENED | no silent !user skip |
| Repository getScoped/queryScoped | WIRED | cross-branch read deny |
| electron/rbac-session | WIRED | bind/clear + channel policy |
| electron/main handle() | WIRED | assertChannelAllowed |
| preload rbac API | WIRED | |
| index showPage/export/drawer/reports | WIRED | |
