# V2-5.6 — Windows UAT

## Runtime

- Script: `scripts/windows-uat/v2-5-6-ux-runtime.cjs`
- Evidence: `docs/integration-v2-5-6/evidence/device-a-uat.json`, `device-b-uat.json`, `windows-build.json`
- CI: `.github/workflows/v2-5-6-release-gate.yml` on `windows-2022`

## Device A

UX unit + scenarios U01–U06; records optional `dist/win-unpacked` hashes when present.

## Device B

Adversarial focus: cancel mid restore, honest progress, redact/token leak block, RTL/LTR.

## Screenshots

Critical flows under `evidence/screenshots/` indexed by `screenshots-index.json`.
