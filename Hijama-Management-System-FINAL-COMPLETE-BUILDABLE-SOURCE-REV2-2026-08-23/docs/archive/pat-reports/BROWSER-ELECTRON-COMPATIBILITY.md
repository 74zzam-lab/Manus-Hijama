# Browser vs Electron Compatibility Report

| Tool | Browser | Electron |
|------|---------|----------|
| License Builder | ✅ | ✅ |
| Upgrade Wizard | ✅ | ✅ |
| Package Builder | Disabled + message | ✅ |
| New Activation | ✅ | ✅ |
| Renew / Import Export | ✅ | ✅ |
| Registry Backup/Restore | ✅ (localStorage) | ✅ |
| Update Diagnostics | ✅ | ✅ |
| Data Integrity Check | ✅ | ✅ |
| Copy Device ID | ✅ | ✅ |
| System Diagnostics | ✅ | ✅ |
| Registry Health | ✅ | ✅ |
| Bundle Health | ✅ | ✅ |
| Communication Gateway | ✅ (UI) | ✅ |
| Hardware Bridge / Printers | Limited | ✅ |

## Notes

- Package Builder requires Electron for `package-registry` persistence.
- Copy Device ID uses Clipboard API (requires user gesture — tested via programmatic call).
- Hardware Bridge diagnostics reflect Electron when `cuppingElectron` is present.
