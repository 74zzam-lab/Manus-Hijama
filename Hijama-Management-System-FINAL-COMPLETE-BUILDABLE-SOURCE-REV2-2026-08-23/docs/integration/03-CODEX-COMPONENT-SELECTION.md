# Codex Component Selection Matrix

**Sources:** Cursor tip `c1efdd3` vs Codex extract `Tadawi-no-logs-cursor-uninstall-license-wipe-fc7d`  
**Rule:** Selective port only. Reject CDN/QR/CSP downgrades and secret material.

| System | Cursor implementation | Codex implementation | Which is better? | Why? | Can be ported safely? | Dependencies | Migration risk | Decision |
|--------|----------------------|----------------------|------------------|------|----------------------|--------------|----------------|----------|
| SQLite dual-run | `cupping-sqlite-bridge.js` + schema v4 | SoT schema v11 + services | Codex (target) | True SoT | PARTIAL now | better-sqlite3 | High | **Foundation only (H5)**; cutover later |
| Schema | `migrations/001_initial.js` v4 | `database/schema.js` v1–11 | Codex depth / Cursor stability | Cursor matches tip | Adapter first | — | High | **hybrid-schema adapter** |
| Repositories | Cursor repos | Codex repos + richer | Codex | Completeness | Later | schema | Med | Defer full replace |
| Services | Limited / UI-bound | `database/services/*` | Codex | Domain depth | Yes with adapters | schema tables | Med–High | **Appointments first** |
| Backup | ZIP/meta + CDBK crypto | Backup V2 `.tdw` + CDB2 | Codex | Integrity/restore | Yes (main process) | fflate, sqlite | Med | **PORT (H4)** |
| Restore | Existing cloud/local DB restore | Staged restore + rollback | Codex | Safer | Yes | Backup V2 | Med | **PORT with V2** |
| Disaster Recovery | Limited docs | `DISASTER-RECOVERY.md` | Codex | Ops clarity | Docs yes | — | Low | **PORT docs** |
| Medical | Legacy HTML | medical-record-service | Codex | Completeness | Later | v3 tables | High | Defer after SoT tables |
| Appointments | Status normalize in HTML | appointment-service V2 | Codex | Engine | Yes via snapshot adapter | v4 tables optional | Med | **PORT service + adapter** |
| Financial | Legacy + golden tests | financial-service | Codex depth / Cursor golden | Risk to finance | Later | v5 tables | High | Defer |
| Workforce | Legacy payroll | workforce-service | Codex | Depth | Later | v6 | High | Defer |
| Reports | HTML + Owner cards | reporting-service | Codex | Depth | Later | — | Med | Defer |
| Import/Export | import-studio present | import-export-service | Tie / Cursor proven | Tip verified | Later | — | Med | Keep Cursor; revisit |
| Owner Hub | NextGen 21–40 on tip | NG-01…19 + cloud hub | Cursor tip (newer gates) | Already on base | N/A | — | — | **KEEP Cursor** |
| Cloud/API | Drive Cloud V2 | + Fastify server | Cursor for desktop | Server optional | Server not required | Postgres | High | **Reject required server** |
| Installer NSH | Cupping Center wipe fixes | Richer lifecycle prompts | Cursor for wipe correctness | Post-20 fixes critical | Lifecycle modules selective | — | Med | **KEEP Cursor NSH** |
| Auto-update | Limited | update-policy fail-closed | Codex | Safer defaults | Yes (no CSP) | Ed25519 | Low | **PORT policy modules** |
| Uninstall | uninstall-prep tip fixes | Explicit full removal flows | Cursor tip | Already fixed | Compare later | — | Low | **KEEP Cursor** |
| Build scripts | prebuild + brand assets | Similar + npmRebuild false | Hybrid | Icon embed from Codex | Yes | electron-builder | Low | **PORT icon strategy** |
| Packaging | asarUnpack sqlite | Similar + extra files | Tie | — | — | — | Low | Align files list carefully |
| Icons | Same ICO, signAndEdit false | Same ICO, signAndEdit true | Codex config | Root cause | Yes | rcedit/Wine | Low–Med | **PORT config** |
| Renderer modularization | None | `renderer/*` partial | Codex direction | Rewrite risk | Incremental only | — | Med | **Optional CSS only (H7)** |
| Design system | Legacy CSS | design-system.css | Codex additive | Must keep local fonts | Yes if CDN stripped | — | Low | **PORT stripped** |
| Licensing | V6 on tip | V6 + License Builder | Codex tooling | Builder optional | Later | — | Med | Keep Cursor; Builder later |
| Documentation | Phase RESULTS + font audits | Manuals / DR / schema | Both | Ops manuals from Codex | Yes | — | Low | **PORT adapted** |
| Printing/QR | Local QR | Remote QR | **Cursor** | Security/offline | N/A | — | — | **REJECT Codex print QR** |
| CSP | Strict | Allowlist CDN/QR | **Cursor** | Security | N/A | — | — | **REJECT Codex CSP** |

## Reject list (hard)

- Any `fonts.googleapis.com` / `fonts.gstatic.com`
- Any `api.qrserver.com`
- Tests asserting remote QR
- Expanded CSP `font-src https:` / `img-src` QR hosts
- Embedded production OAuth secrets from Codex tree
- Full merge of Codex branch / ZIP as history
