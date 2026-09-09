# Delete / Merge / Deprecate Inventory

Rule: suggestions only — **no code deleted in this review**. Prefer DEPRECATE first if still reachable by customers.

| Item | Action | Why |
|------|--------|-----|
| `#login-drive-bootstrap-panel` + login copy “مفتاح → Google → فرع → Owner” | DELETE (DOM) / MERGE copy into BootFlow-only messaging | Inventory already marks CSS-dead; confuses customer journey |
| Backup V1 UI button `runCloudDbBackupNow` / Cloud DB Backup panel | DEPRECATE → DELETE after V2 DR UAT PASS | LevelDB snapshot fights SQLite SoT; data-loss confusion |
| `electron/cloud-db-backup.js` + `clinic-snapshot.js` + `cupping-cloud-db-backup.js` | DEPRECATE then DELETE | Legacy of V1; keep only if migration tool needed offline |
| `cloud/backup-layer.js` daily JSON Drive snapshots | MERGE into Backup V2 policy or DEPRECATE | Third backup path for same “protect clinic data” job |
| Renderer `ConflictQueue` localStorage (`__tdw_conflict_queue__`) | MERGE into SQLite `sync_conflicts` | Dual conflict stores |
| Attachment manifest `__tdw_attachment_manifest__` vs `attachments_meta` | MERGE to one catalog key | Sync/lifecycle ambiguity |
| `cloud/db-bridge.js` + localStorage adapter in `repository.js` after SoT freeze | DEPRECATE | Transitional dual-write surface |
| BootFlow hidden `owner` step + `ensureOwnerBootstrapWizard` customer exposure | KEEP for support only; DELETE from customer-visible copy | Already not in NEW_STEPS; still cognitive residue |
| Inline `FEATURE_REGISTRY` in `index.html` | MERGE with `license/registries/feature-registry.json` | Drift risk |
| Docs older phase PASS matrices implying readiness | DEPRECATE archive under `docs/archive/` with banner | Conflicts with v2-5.9 0/40 truth |
| `docs/comparison/` untracked | DELETE if not intentional | Noise |
| Untracked `source-release-*.tar.gz` under v2-5-7 evidence | DELETE from working tree / stop generating into evidence | Inflates trees; not needed in CI artifacts |
| Dead CSS for superseded panels | DELETE after DOM removal | Dead CSS |
| Unused env flags documented only (`HYBRID_CLOUD_SYNC`, `LICENSE_ENGINE_V2_ENABLED`) | DELETE from docs or implement | Doc drift |
| Duplicate Owner recovery entry points (Hub + DevTools + BootFlow support) | MERGE to one Support runbook + one primary UI | Operator confusion |
| Multiple `verify:v2-5-*` gates on every push historically uploading win-unpacked | KEEP gates; uploads already slimmed | Artifact policy fixed in CI stabilization |
| Mega `index.html` (~27k LOC) | FUTURE split (not pre-release DELETE) | Maintainability; high risk to split before pilot |
| Tests that only regex-scan source for “PASS” narrative | KEEP for wiring; add runtime UAT separately | Not delete — clarify purpose |

## Official single paths (proposed)

| Job | Official path | Retire |
|-----|---------------|--------|
| Activation | BootFlow only | Login/Lic Drive bootstrap panels |
| Operational writes | SQLite bridge + outbox | Direct LS SoT assumptions; Backup V1 restore as ops recovery |
| Clinic backup/DR | Backup V2 | Backup V1 Cloud DB; clarify daily JSON layer as optional |
| License runtime | Drive `license.json` | Sheets as ops SoT (already forbidden in code) |
| Branch write context | `BranchContexts.operationalWriteBranch` | Single shared `activeBranch` mental model |
| Conflict resolution | SQLite conflicts + one UI | LS conflict queue |
| Attachments | One metadata table + blob store | Dual manifest keys |
