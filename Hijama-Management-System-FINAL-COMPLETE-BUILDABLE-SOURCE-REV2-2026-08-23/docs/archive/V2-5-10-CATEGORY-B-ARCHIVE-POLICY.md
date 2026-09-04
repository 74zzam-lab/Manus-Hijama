# Archive policy (V2-5.10 Category B)

Do **not** delete git history. Prefer moving obsolete phase reports into `docs/archive/` only when:

1. They are not required by `verify:v2-5-9-release-gate` or active gates.
2. A pointer remains in the active phase folder (`docs/integration-v2-5-10/`).
3. Category A evidence under `docs/integration-v2-5-9/evidence/` is never archived until Production Candidate.

Do **not** commit:

- `docs/comparison/` scratch trees
- `docs/integration-v2-5-7/evidence/source-release-*.tar.gz`
- Large binary dumps

Those are excluded from the eventual V2-6 production repository (deferred).
