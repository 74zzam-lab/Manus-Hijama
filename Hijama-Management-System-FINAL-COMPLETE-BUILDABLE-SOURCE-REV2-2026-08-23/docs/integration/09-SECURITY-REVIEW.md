# Hybrid Security Review

## Non-negotiables (from Cursor tip)

- CSP: no Google Fonts hosts, no `api.qrserver.com`
- `sandbox` / `contextIsolation` / `nodeIntegration:false`
- Local fonts + local QR
- IPC validation via `electron/security/ipc-validate.js`

## Changes introduced by Hybrid

| Change | CSP impact | Notes |
|--------|------------|-------|
| Backup V2 main-process | None | No renderer network |
| hybrid-schema adapter | None | |
| Appointment service | None | Pure Node |
| design-system.css | Must not add CDN | Strip any Google Fonts |
| signAndEditExecutable | None | Packaging only |
| update-policy (if ported) | None if main-process HTTPS allowlist | Fail-closed |

## Rejected security downgrades

- Codex meta CSP allowlists
- Remote QR generation
- Tests requiring remote QR
- Importing Codex OAuth client secrets

## Residual risks

- Embedded OAuth client secret remains on Cursor tip (pre-existing, owner-driven)
- `'unsafe-inline'` remains (monolith)
- Dual-run still mirrors data until SoT cutover
- Backup V2 restore against foreign schema versions

## Verdict

**Security regression vs Cursor tip: NO** if reject list enforced.
