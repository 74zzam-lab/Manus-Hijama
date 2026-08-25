# Dependency Version Decisions (Hybrid RC)

## Decision summary

| Dependency | Cursor | Codex | Latest compatible (this RC) | Security | Native ABI risk | Breaking changes | **Recommended** | Reason |
|------------|--------|-------|-------------------------------|----------|-----------------|------------------|-----------------|--------|
| electron | ^33.2.0 | ^39.8.5 | Stay on 33.x line | Supported for RC window | Low if stay | Huge 33→39 | **^33.2.0** | Stability with tip tests; 6 majors too risky |
| electron-builder | ^25.1.8 | ^26.15.0 | 25.x with Cursor | OK | Low | Builder 26 churn | **^25.1.8** | Proven with tip; icon fix does not need 26 |
| better-sqlite3 | ^11.10.0 | ^13.0.1 | 11.x with Electron 33 | OK | High if jump with Electron | Major API/native | **^11.10.0** | Keep ABI pair; rebuild still required after win builds |
| fflate | ^0.8.3 | ^0.8.3 | 0.8.3 | OK | None | — | **^0.8.3** | Shared |
| google-auth-library | ^9.15.1 | ^10.9.1 | 9.x for now | Prefer audit later | None | Major | **^9.15.1** | Avoid auth major mid-hybrid |
| xlsx | ^0.18.5 | vendor 0.20.3 tgz | Keep Cursor | Known SheetJS caveats | None | — | **^0.18.5** | Tip golden paths |
| qrcode-generator | ^2.0.4 + vendored assets | (remote QR) | Local vendor | Better offline | None | — | **Keep Cursor local** | Protected |
| bcryptjs | — | ^3.0.3 | Optional later | OK | None | — | **Defer** | With field-vault port |
| electron-updater | — | policy modules only | N/A | — | — | — | **Port policy code later** | Not npm dep in Codex package.json either |
| Node engines | >=20 <23 | unspecified | 20–22 LTS | — | — | — | **Keep Cursor engines** | Tip pin |
| Fastify server deps | — | server/package.json | Separate | — | — | — | **Out of desktop RC** | Optional cloud |

## Rules applied

- Do **not** take newest by default.
- Prefer Windows 10/11 + Electron ABI + `better-sqlite3` rebuild stability.
- No major Electron bump unless tests + native + print/PDF + CSP verified.

## Future track (not this RC)

1. Electron 33 → 35 (intermediate) with rebuild + full `npm test`
2. Then → 39 with better-sqlite3 13 and builder 26
3. Re-run Windows icon/print/SQLite gates each step
