# Google Sheets / License Vault UAT

## Official role

**Sheets / Apps Script vault = `license_registry_integration`**

| Question | Answer |
|----------|--------|
| Source of Truth? | **NO** |
| Operational store? | **NO** |
| What it is | License key consume / bundle fetch / registry integration |
| Runtime branches/devices | Signed Drive `license.json` |
| Operational data | SQLite |
| Manual spreadsheet edit | Must NOT overwrite Drive/SQLite ops |

| Check | Result |
|-------|--------|
| Role declared in code (`SHEETS_ROLE`) | CODE |
| `simulateHttpFailure` 401/403/404/429/timeout | CODE |
| OAuth / vault activate path | prior CODE |
| Windows Setup EXE harness E | **UNVERIFIED** |
| Token refresh / account change / restart | **UNVERIFIED** |

Ready for main: **NO**
