# V2-5.3 — Windows UAT

**Runtime:** `scripts/windows-uat/v2-5-3-owner-identity-runtime.cjs`  
**Evidence:** `docs/integration-v2-5-3/evidence/device-a-uat.json`, `device-b-uat.json`, `windows-build.json`

| Device | Role | Result |
|--------|------|--------|
| A | owner-identity-uat (scenarios+unit+owner-rbac) | PASS |
| B | race-and-transfer-uat (O02, I02) | PASS |

Build artifacts hashed when `dist/win-unpacked` / installer present (GHA windows-2022 produces canonical Windows build).
