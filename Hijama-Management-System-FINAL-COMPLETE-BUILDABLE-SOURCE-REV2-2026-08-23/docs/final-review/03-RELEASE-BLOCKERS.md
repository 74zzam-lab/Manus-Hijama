# Release Blockers (actual only)

Only items that can prevent safe customer use, data integrity, or security. Cosmetic polish excluded.

| ID | Severity | User impact | Data-loss risk | Security risk | Reproduction | Root cause | Recommended fix | Required UAT | Can release without? |
|----|----------|-------------|----------------|---------------|--------------|------------|-----------------|--------------|----------------------|
| RB-01 | **P0** | Cannot certify multi-device clinic sync | High | Medium | Two clean Windows installs, same license/branch, CRUD+offline+conflict | Live Device A/B never proven on Setup EXE | Complete Scenario A with evidence; fix defects found | Scenario A full | **NO** |
| RB-02 | **P0** | Activation/license may fail for real Google customers | High | High (token mishandling) | Clean install → Google login → license pull → restart | Live OAuth/Drive path UNVERIFIED | Prove OAuth+refresh+license pull on Installed EXE | Activation S1/S2 | **NO** |
| RB-03 | **P0** | Restore may leave clinic on wrong/stale revision | High | Medium | Backup V2 → wipe device → restore → sync | DR reconcile proven in unit only | Scenario C on Installed EXE; ban Backup V1 for ops recovery until deprecated | Scenario C | **NO** |
| RB-04 | **P0** | Operator may restore LevelDB snapshot while SQLite is SoT | High | Medium | Settings → Cloud DB Backup V1 restore after SQLite ops | Backup V1 still live beside V2 | Hide/disable V1 in UI; document V2-only DR; migrate customers | V1 disabled + V2 DR | **NO** |
| RB-05 | **P1** | Attachments may desync / wrong branch blob | High | Medium | Add attachment Device A → pull B; hash mismatch cases | Manifest vs `attachments_meta`; LS fallback | Unify metadata; prove lifecycle states on A/B | Attachments A/B | **NO** for clinics using files |
| RB-06 | **P1** | Multi-branch org may push wrong scope / inherit data | High | Medium | Create second branch; Device B join; Owner All Branches write attempt | Branch isolation + atomic create unproven live | Scenario B + Owner mode UAT | Scenarios B+D | **NO** for multi-branch |
| RB-07 | **P1** | Sheets/vault confusion or overwrite fears | Medium | Medium | Manual spreadsheet edit + app ops | Role coded correctly; live harness missing | Scenario E prove vault never overwrites Drive/SQLite | Scenario E | YES for SQLite-only clinics if Sheets unused — **NO** if vault activation required |
| RB-08 | **P1** | UI unusable at common scales/resolutions | High | Low | 1366×768 @150%, modal footers | modal-shell partial adoption; no interactive proof | Fix clipped modals found in Setup EXE matrix | Responsive matrix | **NO** if blockers found; YES only if matrix PASS |
| RB-09 | **P1** | Runtime errors silently swallowed | Medium | Medium | Full journey with DevTools open | Renderer silent catches; sweep UNVERIFIED | Zero unhandled errors on Scenario A–E | Runtime error sweep | **NO** |
| RB-10 | **P2** | Cannot distribute/build evidence pack | Medium | Low | GHA CreateArtifact quota lag | Actions storage accounting | Wait recalc / keep slim policy; mirror SHA in git | Artifact upload green | YES short-term if Setup EXE delivered another audited channel |

## Non-blockers (do not treat as release stop)

- Splitting `index.html` into modules
- Archiving old phase docs
- Perfect Owner Hub information architecture
- Perf SLO tuning beyond catastrophic freezes
- Removing every transitional bridge before pilot

## Gate truth

Until RB-01..RB-09 closed with Installed Setup EXE evidence:

- Requirements remain UNVERIFIED/FAIL for release purposes  
- `Ready for release: NO`  
- `Ready for main: NO`
