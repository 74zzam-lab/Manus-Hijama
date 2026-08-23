# V2-5 Final Stabilization — Current Reality

**Branch:** `cursor/v2-5-final-stabilization-c2ea`
**Baseline:** master release gate tip `cc8a40d`

## User-reported blockers (pre-fix)
- Errors opening Google bind pages (pre-login RBAC blocked OAuth/Drive IPC)
- Unexpected runtime Errors
- Google login failures
- Google Sheets communication failures
- License pull failures
- Owner treated as Admin-adjacent in places

## Fixes landed this phase
- Expanded `PUBLIC_CHANNELS` for pre-login Google/license/cache
- Soft RBAC IPC returns `{ok:false}` (no throw crash)
- Google Drive: PKCE, flexible loopback, soft connect errors, revoke on disconnect, read paths without folder create
- Sheets: `GoogleSheetsOps` soft classifier wired into vault activate/fetch
- Owner: login option, mint guard, expired-license login, Hub mutate UI Owner-only, push license Owner/bootstrap gated
- DeviceCache soft writes; cache write public for activation snapshot

## Classification
| Area | Status |
|------|--------|
| Pre-login Google IPC | REAL fixed |
| PKCE OAuth | REAL |
| Token encryption | REAL (prior + revalidated) |
| Sheets API in Electron | ABSENT by design (vault only) |
| Owner independent role | REAL hardened |
| Windows Release full install cycle | Evidence via harness + GHA Windows workflow |
