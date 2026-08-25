# V2-5.7 — Current Reality

**Branch:** `cursor/v2-5-7-production-release-c2ea`
**Baseline:** V2-5.6 tip `b5a2f2a` (GHA green)
**Gate:** B–G production release evidence filled

## Summary
Windows NSIS build, uninstall-prep preserve, SQLite migrations, Backup V2, and prior phase gates are **REAL**. This phase consolidates release packaging evidence: SHA-256 index, portable policy (`supported:false`), lifecycle matrix, migration preserve/rollback proofs, compat matrix, and independent-review gate wording (**Ready for main = NO**).

## Classification
| Area | Status |
|------|--------|
| npm ci / npm test / build:win | REAL (prior GHA + this branch workflow) |
| Installer + win-unpacked | REAL (`docs/integration-v2-5-7/evidence/release-artifacts.json`) |
| Portable target | REAL policy — not in `package.json` targets → `supported:false` |
| Icons (exe/installer/desktop/start/taskbar/ARP) | REAL — `build/Program-Icon.ico` + PE inspect |
| App-only uninstall preserve | REAL (nsis + uninstall-prep tests) |
| Full wipe explicit | REAL (`/FULLWIPE=1` + confirm) |
| Schema migrations 001→002 / V2-4 preserve | REAL (`database/migration-release.js`) |
| Migration pre-backup + corrupt refuse | REAL (`DatabaseOpenError`, no empty replace) |
| Checksums + lean source archive | REAL |
| Independent review before main | POLICY — **Ready for main NO** (REL-257-019) |
