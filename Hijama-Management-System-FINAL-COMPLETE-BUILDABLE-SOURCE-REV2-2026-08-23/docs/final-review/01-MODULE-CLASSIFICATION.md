# Module Classification

Legend: WORKING · PARTIALLY WORKING · BROKEN · UI ONLY · DUPLICATE · LEGACY · DEAD CODE · OVER-ENGINEERED · MISSING · RISKY · GOOD AS IS

| Module | Class | Evidence / notes |
|--------|-------|------------------|
| Login | PARTIALLY WORKING | Works in unit wiring; live OAuth/session on Setup EXE UNVERIFIED. Copy still mentions Owner in customer path. |
| Authentication (local users) | WORKING | Password + forced Owner seed change implemented in `index.html`. |
| Google OAuth | PARTIALLY WORKING / RISKY | Real PKCE loopback path; live account change / refresh on Installed EXE UNVERIFIED. |
| Owner seed + forced PW | WORKING | Hash-only seed, `mustChangePassword`, non-dismissible change flow coded. |
| Owner Hub | PARTIALLY WORKING / OVER-ENGINEERED | Real actions (license, devices, branches) via `owner-hub.js`; mixes support + ops + diagnostics. Live UAT UNVERIFIED. |
| Admin / RBAC UI | PARTIALLY WORKING | Renderer guards + main IPC RBAC; empty-KV deny coded. Live revocation/session UAT missing. |
| RBAC Main enforcement | GOOD AS IS / RISKY edges | `rbac-session.js` + preload allowlist; some public bootstrap channels intentional. |
| Activation / BootFlow | PARTIALLY WORKING / OVER-ENGINEERED | 8-step wizard real; duplicate panels still in DOM (login/lic). |
| Licensing / Drive license.json | PARTIALLY WORKING | Drive signed license is runtime registry; live pull/CAS UAT UNVERIFIED. |
| Google Sheets / vault | PARTIALLY WORKING | Role correctly `isSourceOfTruth:false`; live Sheets harness UNVERIFIED. |
| Branches / BranchContexts | WORKING (code) | deviceBound / reporting / write split real. Live isolation UNVERIFIED. |
| Legacy branch migration | WORKING (code) | Explicit mapping + push block; Windows proof missing. |
| Devices / DeviceRegistry | PARTIALLY WORKING | Real license.json device lifecycle; A/B join UNVERIFIED. |
| Backup V2 (SQLite) | PARTIALLY WORKING | Preferred DR path; Installed EXE DR Scenario C UNVERIFIED. |
| Backup V1 Cloud DB (LevelDB) | LEGACY / RISKY | Still in UI (`runCloudDbBackupNow`); snapshots localStorage era data. |
| Cloud V2 daily backup layer | DUPLICATE / OVER-ENGINEERED | Third backup concept on Drive. |
| Restore reconciliation | WORKING (code) | No immediate push; pull/reconcile first. Live DR UNVERIFIED. |
| V2 Sync engine | PARTIALLY WORKING | Push-on-write + poll + outbox drain real; live A/B/conflict UNVERIFIED. |
| SQLite + Outbox | PARTIALLY WORKING | Durable outbox/schema real; SoT cutover incomplete for all keys. |
| localStorage DB | LEGACY / RISKY | Still base `DB` in `index.html`; bridge patches afterward. |
| Attachments | PARTIALLY WORKING / RISKY | Lifecycle + IPC blobs exist; manifest vs `attachments_meta` split; live A/B UNVERIFIED. |
| Conflict policies | PARTIALLY WORKING | TableMergePolicy real; renderer conflict queue still LS. |
| Reports | PARTIALLY WORKING | Pages exist; Owner All-Branches reporting isolation UNVERIFIED. |
| Finance / ledger / invoices | WORKING (feature presence) | Substantial UI + verify scripts; not the current release blocker set. |
| Appointments / bookings | WORKING (feature presence) | Hybrid appointments v2 + bookings page. |
| Employees / attendance | WORKING (feature presence) | Domain pages + attendance verify. |
| Settings | PARTIALLY WORKING | Mix of local settings + cloud flags; some write via `DB.set`. |
| Printing / PDF / QR | WORKING (wiring) | Main print IPC + local QR tests; printer hardware UAT not proven here. |
| Installer / Update / Uninstall | PARTIALLY WORKING | NSIS keep-by-default + full wipe explicit; CI smoke PASS; full lifecycle matrix live incomplete. |
| Responsive UI | PARTIALLY WORKING / UI ONLY proof | design-system modal-shell; many modals not migrated; interactive matrix UNVERIFIED. |
| Modals | PARTIALLY WORKING | Sticky shell CSS exists; ~28 overlays vs ~5 modal-shell adoptions. |
| Error handling | PARTIALLY WORKING | Main structured; renderer many silent catches; runtime sweep UNVERIFIED. |
| Logging | PARTIALLY WORKING | Audit + activation redaction; no single operator log pack proven. |
| Performance | MISSING (proof) | Perf docs exist; live SLO measurement UNVERIFIED. |
| Tests | GOOD AS IS for wiring | 97/97; inadequate as release proof. |
| CI/CD | PARTIALLY WORKING | Windows build/smoke real; artifact upload lag; gate correctly fails on UNVERIFIED. |
| Documentation | DUPLICATE / RISKY | Phase docs sprawl; older PASS rows conflict with v2-5.9 0/40. |

## Cross-cutting

| Concern | Class |
|---------|-------|
| SQLite as sole operational SoT | PARTIALLY WORKING |
| Dual Backup V1+V2 | LEGACY + RISKY |
| Activation single path | OVER-ENGINEERED / DUPLICATE |
| Live multi-device proof | MISSING |
| Live Google proof | MISSING |
