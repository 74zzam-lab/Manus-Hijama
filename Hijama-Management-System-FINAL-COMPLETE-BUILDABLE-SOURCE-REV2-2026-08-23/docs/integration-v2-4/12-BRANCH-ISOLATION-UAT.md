# 12 — Branch Isolation UAT

## Automated

`test-v2-4-outbox-dual-device.js` — Device on BR-B pull does not see BR-A clients (FileRemote path isolation).

## Attack matrix (installed release)

| Attack | Expected | Result |
|--------|----------|--------|
| UI filter leak | deny | NOT_STARTED |
| IPC read other branch by id | deny + audit | NOT_STARTED |
| Service invoke | deny | NOT_STARTED |
| Payload branchId tamper | deny | NOT_STARTED |
| Path traversal to other branch Operational | deny | NOT_STARTED |
| Download remote path branch B | deny | NOT_STARTED |
| DevTools role forge | deny at trusted layer | NOT_STARTED |

ID-stable cloud paths: `NajjarTech/centers/{centerId}/branches/{branchId}/…` (`cloud/drive-layout.js`).
