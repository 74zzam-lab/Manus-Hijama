# V2-5 Master — Requirements Index

**Program:** V2-5 (Restore → Production Release)  
**Branch:** `cursor/v2-5-master-release-gate-c2ea`  
**Baseline tip:** V2-5.7 `cursor/v2-5-7-production-release-c2ea`  
**Master verifier:** `npm run verify:v2-5-master-release-gate`

## Phase map

| Phase | Scope | Traceability | Release gate |
|-------|-------|--------------|--------------|
| V2-4 | Hybrid cloud / Owner Hub baseline | `docs/integration-v2-4/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-4-release-gate` |
| V2-5.1 | Restore & Disaster Recovery | `docs/integration-v2-5-1/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-1-release-gate` |
| V2-5.2 | Backup & Cloud Sync Hardening | `docs/integration-v2-5-2/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-2-release-gate` |
| V2-5.3 | Owner, Identity & License Lifecycle | `docs/integration-v2-5-3/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-3-release-gate` |
| V2-5.4 | RBAC Full Audit & Enforcement | `docs/integration-v2-5-4/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-4-release-gate` |
| V2-5.5 | Performance, Scale & Reliability | `docs/integration-v2-5-5/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-5-release-gate` |
| V2-5.6 | UX Hardening & Operational Visibility | `docs/integration-v2-5-6/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-6-release-gate` |
| V2-5.7 | Production Build, Migration & Final Release | `docs/integration-v2-5-7/REQUIREMENTS-TRACEABILITY.md` | `verify:v2-5-7-release-gate` |

## Master close rules

1. Every phase TRACEABILITY row Result = `PASS` (no forbidden tokens).
2. Every phase `evidence/` directory present with Windows UAT (`device-a-uat` / `device-b-uat` / windows-uat style) as available.
3. V2-5.7 installer/SHA (`release-artifacts.json` and/or `checksums.sha256`) present.
4. V2-5.7 `migration-all.json` present.
5. V2-5.6 screenshots (`evidence/screenshots/` + index) present.
6. Secrets scan clean across `docs/integration-v2-5*`.
7. FINAL state: **Ready for independent review: YES**; **Ready for main: NO**.

## Related master docs

- `MASTER-EVIDENCE-INDEX.md`
- `FINAL-RELEASE-READINESS.md`
