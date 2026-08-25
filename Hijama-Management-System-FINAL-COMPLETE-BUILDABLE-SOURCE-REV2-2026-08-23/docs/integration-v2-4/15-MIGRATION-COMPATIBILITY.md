# 15 — Migration Compatibility

| Case | Result |
|------|--------|
| Upgrade V2-3.5 dataset → schemaVersion ≥ 5 (sync platform) | Automated openDatabase applies `002_sync_platform` |
| Interrupted migration recovery | Follow existing SQLite migration lock/backup policy — re-prove |
| Device A new / B old format | NOT_STARTED |
| Remote newer unsupported schema → pause, preserve local | Policy in error classify; runtime NOT_STARTED |
| Remote old schema readable by new client | NOT_STARTED |

**Do not** create empty DB on corrupt open (V2-3.5 failsafe preserved).
