# Known Issues — Baseline (Phase 1)

Tracked issues observed during Phase 1 stabilization. None of these were “fixed”
in Phase 1 unless noted — Phase 1 freezes behavior.

## Security / Electron

| ID | Issue | Severity | Target phase |
|----|-------|----------|--------------|
| K-01 | `sandbox: false` on BrowserWindow | Medium | Phase 2 — **addressed** (`sandbox: true`) |
| K-02 | Child windows via `window.open` inherit main preload | High | Phase 2 — **addressed** (print preload only) |
| K-03 | No Content-Security-Policy for renderer | Medium | Phase 2 — **addressed** (session CSP; still allows `'unsafe-inline'` for legacy UI) |
| K-04 | IPC handlers need systematic payload validation | Medium | Phase 2 — **addressed** (typed validation + allowlist) |
| K-05 | OAuth client secret is committed in `electron/cloud-oauth.embedded.json` by owner request for private automatic builds | High | Phase 5 removed; **restored by owner request for private build automation** |
| K-06 | License crypto still client-side (codec V5); differs from Ed25519 V6 design | High | Phase 3 — **partially addressed** (V6 Ed25519 added; V5 HMAC remains for compatibility) |
| K-07 | Broad `innerHTML` usage remains in renderer; sanitizer helper added but not fully wired | Medium | Phase 2 partial / Phase 8–9 |

## Data & Architecture

| ID | Issue | Severity | Target phase |
|----|-------|----------|--------------|
| K-10 | Primary store was `localStorage` only; SQLite added with dual-run mirror | Medium | Phase 4 — **partially addressed** (SQLite + migrate; localStorage still mirrored; UI not fully SQLite-native) |
| K-11 | Monolithic `index.html` (~25k lines) mixes UI + finance logic | Medium | Phase 8 |
| K-12 | Commission + payroll formulas live in renderer HTML; hard to unit-test without extraction | Medium | Phase 8 / 13 |
| K-13 | Dual naming legacy (`Cupping Center`) still exists for fixed `userData` compatibility; UI defaults now normalized to APP_META product name | Low | Phase 9 — **partially addressed** (runtime naming unified; userData folder intentionally unchanged for backward compatibility) |

## Quality / Tooling

| ID | Issue | Severity | Target phase |
|----|-------|----------|--------------|
| K-20 | No ESLint config existed before Phase 1; lint scope starts narrow | Low | Phase 1+ |
| K-21 | No unified `npm test` entrypoint existed before Phase 1 | Low | Phase 1 (addressed) |
| K-22 | Many verify scripts under `scripts/` not wired to package.json | Low | Phase 1+ |
| K-23 | Historical QA artifacts lived in `pat-reports/` at repo root | Low | Phase 1 (archived) |
| K-24 | Repository previously distributed as ZIP-only upload on `main` | Medium | Phase 1 (extracted) |

## Functional / Product Notes

| ID | Issue | Severity | Target phase |
|----|-------|----------|--------------|
| K-30 | Booking statuses expanded with lifecycle states; legacy records may still contain old aliases | Info | Phase 11 — **partially addressed** (normalization + new statuses + actions) |
| K-31 | Multi-branch / cloud sync + Owner Hub operational diagnostics addressed in Phases 18–19; cross-branch revenue/KPI charts remain deferred | Info | Phase 18–19 — **addressed** (revenue analytics deferred) |
| K-32 | Windows installer / signed builds require Windows host + code-signing certificate for full validation; Phase 20 adds structural release gate + unsigned-internal readiness path | Info | Phase 20 — **partially addressed** (signed public release still needs Windows cert) |

## Explicit Non-Fixes in Phase 1

Phase 1 must **not** change financial calculations, commission rules, payroll math,
attendance policy outcomes, or license validation semantics.
