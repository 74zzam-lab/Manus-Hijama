# V2-5.7 — Module Wiring Matrix

| Module | Status | Role |
|--------|--------|------|
| package.json build (nsis x64) | REAL | electron-builder installer |
| scripts/v2-5-7-release-artifacts.cjs | REAL | artifact index + SHA-256 + icons + source archive |
| database/migration-release.js | REAL | V2-4→V2-5 preserve + corrupt refuse |
| scripts/v2-5-7-migration-harness.cjs | REAL | MIG evidence JSON |
| scripts/v2-5-7-lifecycle-matrix.cjs | REAL | LIFE evidence JSON |
| scripts/v2-5-7-scenarios-all.cjs | REAL | R01–R08 scenarios |
| scripts/windows-uat/v2-5-7-release-runtime.cjs | REAL | device A/B + build hashes |
| tests/baseline/test-v2-5-7-production-release.js | REAL | unit suite |
| scripts/verify-v2-5-7-completion.cjs | REAL | release gate |
| scripts/verify-uninstall-prep.js | REAL | preserve data/license |
| tests/baseline/test-nsis-cupping-center-wipe.js | REAL | NSIS policy |
| database/connection.js | REAL | DatabaseOpenError / migrate |
| electron/backup-v2-core.js | REAL | backup path (prior) |
| .github/workflows/v2-5-7-release-gate.yml | REAL | windows-2022 CI |
