# Domain Services Integration

## Policy

Do not port a module only because it is larger. Require compatibility, tests, and no UI breakage.

| Module | Completeness | Data model fit | UI fit | Tests | Security | Perf | Migration risk | Duplicate? | Decision |
|--------|--------------|----------------|--------|-------|----------|------|----------------|------------|----------|
| Appointments V2 | High | Needs rooms/waitlist extras or adapter | Can sit behind API used by later UI | Codex has suite (Electron-bound) | OK if local | OK | Med | Partial overlap with HTML statuses | **PORT service + Cursor snapshot adapter** |
| Medical V2 | High | Needs v3 tables | HTML medical UI | Electron-bound | PHI risk | OK | High | Yes | **Defer** |
| Financial V2 | High | Needs v5 tables | Finance HTML + goldens | Electron-bound | High | OK | **Very high** | Yes | **Defer** (protect goldens) |
| Workforce V2 | High | Needs v6 | Payroll UI | Electron-bound | OK | OK | High | Yes | **Defer** |
| Reports V2 | Med–High | Service layer | Reports UI | Electron-bound | OK | OK | Med | Partial | **Defer** |
| Import/Export V2 | Med | Batches tables | import-studio exists | — | OK | OK | Med | Yes | **Keep Cursor** |
| Printing V2 | High | templates | Print UI | Asserts remote QR | **Reject QR** | — | — | Yes | **Reject remote QR parts** |

## Appointments port shape

- Add `database/services/appointment-service.js` (from Codex, no Electron deps)
- Add `database/services/cursor-snapshot-repository.js` adapting bridge/local arrays
- Feature flag `HYBRID_APPOINTMENTS_V2`
- Do not delete Cursor booking status code in `index.html`

## Later waves

Medical → Workforce → Reports → Finance (finance last due to golden risk).
