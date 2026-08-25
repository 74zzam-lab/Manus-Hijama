# Test Results — Hybrid RC

**Branch:** `integration/hybrid-production-candidate`  
**Commit:** `51e1577`  
**Date:** 2026-07-29  

## npm test

```text
Summary: 60/60 passed
```

Includes original Cursor suites (54) plus Hybrid:
- hybrid:icon-packaging
- hybrid:backup-v2
- hybrid:sot-foundation
- hybrid:appointments-v2
- hybrid:font-csp
- hybrid:local-qr

## Notes

- After `build:dir` (Windows target), `npm rebuild better-sqlite3` was required on Linux host before retest — expected ABI behavior.
- Codex Electron.exe-bound suites were **not** imported wholesale.
