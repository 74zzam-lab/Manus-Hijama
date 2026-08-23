# UX Assessment

## Journey critique

| Journey | Friction | Severity |
|---------|----------|----------|
| New customer | 8 BootFlow steps + restart messaging; dense progress UI; Google+license+org+branch+restore+sync before work | High |
| Old customer new device | Auto-discovery path exists in code; live reliability unknown; recovery panels compete with BootFlow | High |
| Second device | Mentally clear (same license/branch) but **unproven**; conflict/offline UX not validated | Critical (release) |
| First branch | Custom name supported; still coupled to activation length | Medium |
| Another branch | Owner Hub atomic enroll coded; failure `BRANCH_CREATION_PENDING` needs clear operator UX live | Medium |
| Restoring data | Multiple restore entry points (BootFlow, Backup V2, legacy Cloud DB) — **dangerous ambiguity** | Critical |
| Offline work | Outbox design supports it; user messaging/status UNVERIFIED | High |
| Change Google account | Hub action exists; token/account-switch live cases UNVERIFIED | Medium |
| Reset Owner password | Forced change + DevTools reset exist; support path crowded with other Owner tools | Medium |
| Owner Hub | Powerful but overloaded (approvals, license push, delete branch, Google identity, diagnostics) | High |
| Switch branches | Context split is correct conceptually; users may not understand reporting vs write mode | High |
| Recover from failure | Error catalog for activation helps; many silent renderer catches hide root cause | Medium |

## Specific UX problems

1. **Duplicate activation mental models** — BootFlow vs login Drive panel vs license Drive panel vs DevTools.  
2. **Owner messaging inconsistency** — “Owner not part of customer activation” vs login copy still listing Owner.  
3. **Two backup buttons** — “نسخ الآن” Cloud DB vs “نسخ V2 الآن”.  
4. **Modal/responsive debt** — design-system shell not universally applied; sticky footers may clip at 125–175%.  
5. **Owner Hub as kitchen sink** — support recovery next to daily branch mode.  
6. **Long first-run** — even “simplified” path is cognitively heavy for a clinic receptionist.  
7. **Arabic error quality uneven** — activation catalog good; generic sync/backup failures may be opaque.  
8. **Success without proof** — CI green can falsely reassure operators/docs readers.

## What feels good

- Arabic-first clinic domain coverage is broad.  
- Forced Owner seed password change is the right security UX.  
- Installer uninstall default preserving data is correct for clinics.  
- Branch Mode vs Owner Mode concept (once explained) matches real org structure.

## UX simplification recommendations (pre-release vs post)

| Change | Timing |
|--------|--------|
| Hide Backup V1 from normal Settings | **Before release** |
| Remove/dead-strip login Drive bootstrap + fix login copy | **Before release** |
| One restore entry labeled “استعادة Backup V2” | **Before release** |
| Split Owner Hub: Daily Ops vs Support Tools | Post-launch P1 |
| Shorten BootFlow chrome / copy | Post-launch P2 |
| Full modal-shell migration | Post-launch P1 |
