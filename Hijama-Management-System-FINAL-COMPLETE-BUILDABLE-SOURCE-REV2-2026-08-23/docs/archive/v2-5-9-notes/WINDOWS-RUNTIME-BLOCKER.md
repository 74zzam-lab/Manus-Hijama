# V2-5.9 Windows Runtime Blocker

**Date:** 2026-08-01  
**Agent environment:** Linux cloud VM (`process.platform=linux`) — cannot INSTALL a Windows Setup EXE.

## What this environment can / cannot do

| Capability | Status |
|------------|--------|
| Implement production code | DONE |
| `npm test` (97/97) | DONE |
| Cross-compile win-unpacked via electron-builder | DONE (when deps allow) |
| Valid NSIS Setup EXE on Linux/Wine | **FAIL** (stub ~0.5MB; need `windows-2022`) |
| Silent install + smoke on GHA Windows | **Automation landed** (`Install-And-Prove-V259-AE.ps1`) |
| Interactive Google OAuth / Sheets live | **NOT POSSIBLE here** |
| Device A/B physical sync UAT | **NOT POSSIBLE here** |
| Fill 40 requirements as PASS from live Setup EXE | **BLOCKED until Windows proof** |

## Correct phase status

```
Code implementation: DONE (residual closure included)
Automated tests: PASS (97/97)
Windows Runtime proof: NOT DONE
Requirements passed: 0
Requirements unverified: 40
Release gate: FAIL (by design until UAT evidence)
Ready for release: NO
Ready for main: NO
V2-5.9 complete: NO
```

## Linux build note (non-proof)

- `dist/win-unpacked/Hijama Management System.exe` may exist from cross-build
- `dist/HijamaManagement-Setup-*.exe` under 50MB on Linux/Wine is **INVALID** and rejected by gate/harness
- Real Setup EXE + SHA-256 must come from `windows-2022` (`npm run build:win`)

## Human / Windows machine next steps

On clean Windows 10/11 (or wait for GHA `windows-2022` artifacts):

1. `npm ci && npm test && npm run build:win`
2. Record: Windows version, Node, Electron, Setup EXE path, win-unpacked, installer size, installed size, SHA-256, commit SHA
3. `powershell -File scripts/windows-uat/Install-And-Prove-V259-AE.ps1`
4. Execute Scenarios A→E on **Installed** Setup EXE (not `npm start`)
5. Runtime error sweep = 0
6. Fill REQUIREMENTS-TRACEABILITY rows with PASS + evidence only
7. `npm run verify:v2-5-9-release-gate` → exit 0
8. Push evidence; Ready for main remains NO until independent review

Until then, **do not** declare V2-5.9 complete.
