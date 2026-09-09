# V2-5.7 — Failure / Recovery UAT

Evidence: `evidence/failure-recovery.json`

| Path | Expected | Proof |
|------|----------|-------|
| Corrupt DB open | `DatabaseOpenError`; original preserved; no empty replace | `migration-failure-rollback.json`, `migration-no-empty-replace.json` |
| App-only uninstall | Data + license retained | uninstall-prep + LIFE-257-005/006 |
| Silent uninstall | Defaults app-only unless `/FULLWIPE=1` | LIFE-257-009 |
| NSIS upgrade `${isUpdated}` | userData preserved | LIFE-257-002/003 |
| Portable | `supported:false` when not in package.json targets | R01 / release-artifacts.json |
| Wrong wipe / interrupt | DB outside INSTDIR; refuse empty replace | LIFE-257-011/013 |
