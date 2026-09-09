# V2-5 Master — Evidence Index

Aggregate evidence pointers for independent review. Paths are relative to repo root.

## Per-phase evidence roots

| Phase | Evidence root | Windows UAT | Key artifacts |
|-------|---------------|-------------|---------------|
| V2-4 | `docs/integration-v2-4/evidence/` | multi-device UAT docs + scenarios | `scenarios-1-25.json`, `real-cloud-uat.json` |
| V2-5.1 | `docs/integration-v2-5-1/evidence/` | `device-a-uat.json`, `device-b-uat.json` | `scenarios-all.json`, `failure-recovery.json`, `windows-build.json` |
| V2-5.2 | `docs/integration-v2-5-2/evidence/` | `device-a-uat.json`, `device-b-uat.json` | backup/sync scenarios + `windows-build.json` |
| V2-5.3 | `docs/integration-v2-5-3/evidence/` | `device-a-uat.json`, `device-b-uat.json` | owner/identity scenarios + unit |
| V2-5.4 | `docs/integration-v2-5-4/evidence/` | `device-a-uat.json`, `device-b-uat.json` | RBAC/IPC scenarios |
| V2-5.5 | `docs/integration-v2-5-5/evidence/` | `device-a-uat.json`, `device-b-uat.json` | `perf-bench.json`, `scale-dataset.json`, soak harness |
| V2-5.6 | `docs/integration-v2-5-6/evidence/` | `device-a-uat.json`, `device-b-uat.json` | **screenshots/** + `screenshots-index.json`, UX scenarios |
| V2-5.7 | `docs/integration-v2-5-7/evidence/` | `device-a-uat.json`, `device-b-uat.json` | release artifacts, checksums, migration, lifecycle |

## Production / installer (V2-5.7)

| Artifact | Path |
|----------|------|
| Release artifacts + SHA | `docs/integration-v2-5-7/evidence/release-artifacts.json` |
| Checksums | `docs/integration-v2-5-7/evidence/checksums.sha256` |
| Migration suite | `docs/integration-v2-5-7/evidence/migration-all.json` |
| Lifecycle matrix | `docs/integration-v2-5-7/evidence/lifecycle-matrix.json` |
| Secrets scan (phase) | `docs/integration-v2-5-7/evidence/secrets-scan.json` |

## UX screenshots (V2-5.6)

| Artifact | Path |
|----------|------|
| Screenshot set | `docs/integration-v2-5-6/evidence/screenshots/` |
| Index | `docs/integration-v2-5-6/evidence/screenshots-index.json` |

## Master automation

| Item | Path / command |
|------|----------------|
| Master verifier | `scripts/verify-v2-5-master-completion.cjs` |
| npm script | `npm run verify:v2-5-master-release-gate` |
| GHA workflow | `.github/workflows/v2-5-master-release-gate.yml` |
| Traceability roots | `docs/integration-v2-5-{1..7}/REQUIREMENTS-TRACEABILITY.md` |
