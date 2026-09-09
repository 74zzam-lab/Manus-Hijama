# 11 — Multi-Device Windows UAT

**Required:** Installed release on Device/VM A and B, real Google Drive, real SQLite.

| Scenario | A | B | Remote | Result |
|----------|---|---|--------|--------|
| 1 Bootstrap | | | | NOT_STARTED |
| 2 Enrollment | | | | NOT_STARTED |
| 3 A→B sync | | | | NOT_STARTED |
| 4 B→A sync | | | | NOT_STARTED |
| 5 Offline queue | | | | NOT_STARTED |
| 6 Concurrent non-conflict | | | | NOT_STARTED |
| 7 Same-record conflict | | | | NOT_STARTED |
| 8 Delete conflict | | | | NOT_STARTED |
| 9 Branch isolation | | | | NOT_STARTED |
| 10 Owner Hub runtime | | | | NOT_STARTED |
| 11 Device revoke | | | | NOT_STARTED |
| 12 Token refresh | | | | NOT_STARTED |
| 13 OAuth revoke/reconnect | | | | NOT_STARTED |
| 14 Quota/rate limit | | | | NOT_STARTED |
| 15 Interrupted push | | | | NOT_STARTED |
| 16 Interrupted pull | | | | NOT_STARTED |
| 17 Corrupt remote | | | | NOT_STARTED |
| 18 Backup/restore+sync | | | | NOT_STARTED |
| 19 Update installer | | | | NOT_STARTED |
| 20 App-only reinstall | | | | NOT_STARTED |
| 21 Full wipe | | | | NOT_STARTED |
| 22 Sleep/wake | | | | NOT_STARTED |
| 23 Large queue | | | | NOT_STARTED |
| 24 Attachment sync | | | | NOT_STARTED |
| 25 Mixed app versions | | | | NOT_STARTED |

Peer FileRemote automated tests are **not** a substitute for this matrix.
