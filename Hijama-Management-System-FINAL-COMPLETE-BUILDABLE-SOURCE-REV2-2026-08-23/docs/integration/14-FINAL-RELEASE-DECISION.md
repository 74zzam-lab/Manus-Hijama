# Final Release Decision — Hybrid Production Candidate

```text
Branch: integration/hybrid-production-candidate
Latest Commit: 51e1577
Application Version: 2.0.0

Cursor post-Phase20 changes preserved:
- Local fonts / CSP / local QR
- Receipt EN Cupping Center fallback
- Phase 4/9 test fixes
- NextGen 21–40
- NSIS/OAuth/activation UX fixes
- All tip commits from phase-20..fix-local-qr-csp

Codex components integrated:
- Backup V2 core/scheduler/crypto-v2/atomic-file + IPC
- hybrid-schema adapter (SoT foundation, dual-run kept)
- AppointmentService + CursorSnapshotRepository
- update-policy.js
- design-system.css (CDN-free, not linked yet)
- Ops manuals under docs/ops/
- Windows icon rcedit strategy (signAndEditExecutable=true on Win)

Codex components rejected:
- Google Fonts CDN / CSP allowlists
- api.qrserver.com + remote QR tests
- Electron 39 / better-sqlite3 13 / builder 26 jump
- Full schema v11 cutover
- Fastify server as desktop requirement
- Codex OAuth secrets
- Full renderer rewrite
- Replacing Cursor installer.nsh wipe fixes

Build:
PASS (win-unpacked on Linux agent)

EXE icon:
PASS (config) / PARTIAL (runtime needs Windows + rcedit)

Installer icon:
PASS (config) / PARTIAL (full NSIS not run here)

Shortcut icon:
PENDING Windows

Taskbar icon:
PENDING Windows

Electron version:
^33.2.0 (resolved 33.4.11 in build log)

electron-builder version:
^25.1.8

better-sqlite3 version:
^11.10.0

Full npm test:
Passed: 60
Failed: 0
Skipped: 0

SQLite SoT:
PARTIAL (foundation + adapter + dry-run; dual-run default)

Backup V2:
PASS (create/verify/restore smoke)

Offline fonts:
PASS

Offline QR:
PASS

Receipt:
PASS (protected tests)

Windows unpacked:
PASS

Installed Windows:
PENDING

Security regression:
NO

Visual regression:
NO (intentional; design-system not linked)

Remaining risks:
- Windows runtime icon visual confirmation
- SoT cutover not done
- Domain UI not yet wired to AppointmentService
- Embedded OAuth secret pre-existing on tip
- Authenticode still required for public Stable

Ready for Hybrid RC:
YES

Ready for develop:
YES (with Windows icon UAT follow-up)

Ready for main:
NO (needs Windows install UAT + SoT staging + signing policy)
```
