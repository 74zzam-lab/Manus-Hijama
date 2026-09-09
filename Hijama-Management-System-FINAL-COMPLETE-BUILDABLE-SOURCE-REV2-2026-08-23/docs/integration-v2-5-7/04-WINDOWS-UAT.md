# V2-5.7 — Windows UAT

Device A/B runtime produced by `scripts/windows-uat/v2-5-7-release-runtime.cjs`.

| Device | Role | Evidence |
|--------|------|----------|
| A | Primary production-release UAT (artifacts + migration + lifecycle + scenarios + unit) | `evidence/device-a-uat.json` |
| B | Adversarial (corrupt refuse, app-only license, portable honesty, Win10/11 policy) | `evidence/device-b-uat.json` |

Build hashes: `evidence/windows-build.json`  
Compat: `evidence/compat.json` (GHA windows-2022 = Win11-class; Win10 by Electron target policy)
