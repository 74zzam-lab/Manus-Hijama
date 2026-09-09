# V2-5.2 — Test Matrix

| Family | Unit | Integration | Failure | Windows/Cloud |
|--------|------|-------------|---------|---------------|
| BACK-252-* | create/verify/prune/upload hooks | scheduler tick | partial/quota | Device A |
| SYNC-252-* | outbox/conflict/backoff | FileRemote A↔B↔C | 401/429/corrupt | Device A/B + Drive |
| OBS-252-* | countByStatus | Hub IPC | — | Device A |
| UAT-252-* | — | — | offline/reconnect | Windows + real cloud |
| REG/REL | npm test + v2-5.1/v2-4 gates | — | — | GHA |

Commands: `npm test`, `npm run v2-5-2:scenarios`, `verify:v2-5-2-release-gate`, `build:win`
