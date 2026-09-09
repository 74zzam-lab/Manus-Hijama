# V2-5.1 — Test Matrix

| ID family | Unit | Integration / DB | IPC | Failure path | Windows runtime | Notes |
|-----------|------|------------------|-----|--------------|-----------------|-------|
| PROTO-251-* | verifier parse | — | — | gate fail on NOT_STARTED | GHA | Registration + gate |
| ARCH-251-001 | — | wiring docs vs code | — | — | — | Must match inspect |
| REST-251-001..004 | — | bootstrap after install/license/org/branch | IPC restore | wrong order reject | Device A | Lifecycle restore |
| REST-251-005 | auto-pick unit | local+cloud select | — | no authorized backup | Device A/B | Latest authorized |
| REST-251-006 | — | manual file restore | v2Restore | bad password | Device A | UI entry |
| REST-251-007..019 | core restore | SQLite counts/IDs/FK/indexes | — | corrupt | Device A | Data fidelity |
| REST-251-020 | — | restore then peer sync | — | duplicate detect | Device A/B + Drive | No dupes |
| REST-251-021..023 | select helper | local-only / cloud-only / newer | — | both missing | Device A | Source selection |
| REST-251-024..025 | identity gate | — | IPC | wrong center/branch | Device A | Fail closed |
| REST-251-026..027 | corrupt + rollback | live DB preserved | IPC | mid-swap failpoint | Device A | Atomic |
| REST-251-028..030 | progress events | network interrupt | — | resume | Device A | Cloud download |
| DR-251-001..007 | — | delete DB / AppData / new device | — | partial attachments | Device A/B | DR scenarios |
| DR-251-008..015 | gate messages | integrity_check | — | diagnostic copy | Device A | Safety UX |
| UAT-251-001..002 | — | — | — | — | Device A/B | Full UAT |
| REG-251-001 | npm test + v2-4 gate | scenarios | — | — | GHA | No V2-4 regression |
| REL-251-001 | verify:v2-5-1 | — | — | — | GHA workflow | Exit 0 |

## Commands (planned)

```text
npm test
npm run hybrid:backup:test
node tests/backup/backup-restore-v2.test.js   # to be added
npm run verify:v2-5-1-release-gate
npm run build:win
```

## Skip policy

No Skip of release-blocking tests. Failures must FIX → RETEST.
