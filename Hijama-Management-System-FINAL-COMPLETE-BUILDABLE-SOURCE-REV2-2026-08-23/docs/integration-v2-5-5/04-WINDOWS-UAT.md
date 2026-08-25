# V2-5.5 — Windows UAT

## Runtime

- Script: `scripts/windows-uat/v2-5-5-performance-runtime.cjs`
- Evidence: `docs/integration-v2-5-5/evidence/device-a-uat.json`, `device-b-uat.json`, `windows-build.json`
- CI: `.github/workflows/v2-5-5-release-gate.yml` on `windows-2022`

## Device A

Scale + perf + unit + scenarios; records FULL scale counts and optional `dist/win-unpacked` hashes when present.

## Device B

Adversarial reliability focus (P05 + P03): crash markers, backoff, queue bound, incremental policy.

## Soak

Short CI soak recorded in `soak-short.json`; 8-hour mode documented in `soak-8h-harness.json` (`SOAK_HOURS=8`).
