# 15 — Owner Runtime UAT

## Classification of Owner Hub capabilities (current Hybrid)

| Capability | Classification |
|------------|----------------|
| Organization overview (local license doc) | LOCAL ONLY |
| Branch CRUD via Owner Hub | LOCAL ONLY (license JSON + Drive push) |
| Device list / disable / delete | LOCAL ONLY |
| Owner bootstrap token / allowlist | LOCAL ONLY (V2-3 module) |
| Google login ⇒ Owner | **REJECTED by design** (`OwnerBootstrap.googleLoginImpliesOwner()===false`) |
| Server-backed org directory | MISSING (V2-4) |
| Cross-branch consolidated cloud reports | MISSING / LOCAL ONLY summaries |
| Event sync health | MISSING (Drive poll ≠ event sync) |

## Automated headless runtime evidence

Produced by `node scripts/windows-uat/owner-rbac-runtime.cjs` → `docs/integration-v2/evidence/owner-rbac-runtime.json`.

Required assertions:
- Valid token creates Owner once; reuse fails.
- `enrollBranch` without `source:'owner_hub'` fails.
- Branch Admin / Employee `canCreateBranches` false.
- Google does not imply Owner.

Interactive UI Owner Hub screenshots: attach under `evidence/screenshots/` when captured on Windows VM/Sandbox.
