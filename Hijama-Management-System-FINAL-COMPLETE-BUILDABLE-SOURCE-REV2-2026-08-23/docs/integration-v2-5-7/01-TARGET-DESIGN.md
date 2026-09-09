# V2-5.7 — Target Design

Final production release gate for V2-5: reproducible Windows build, lifecycle safety, migration integrity, compatibility UAT, and indexed release evidence.

## Design pillars
1. **Artifacts** — Index Setup exe, win-unpacked exe, optional portable, SHA-256, icons, lean source archive (`scripts/v2-5-7-release-artifacts.cjs`).
2. **Lifecycle** — Clean install / update / repair / app-only uninstall / full wipe / silent defaults / updater never wipes (`scripts/v2-5-7-lifecycle-matrix.cjs` + NSIS + uninstall-prep).
3. **Migration** — V2-4→V2-5 preserve records/attachments/outbox/owner/license; corrupt refuse; pre-migration backup; restore path (`database/migration-release.js`).
4. **Compat** — GHA `windows-2022` = Win11-class CI evidence; Win10 supported by Electron/NSIS x64 target policy (`evidence/compat.json`).
5. **Release** — 60 TRACEABILITY PASS rows; verify gate exit 0; **Ready for main = NO** until independent review (REL-257-019).
