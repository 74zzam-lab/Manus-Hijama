# Test Coverage Gaps

## What 97/97 covers well

- Static presence of critical strings/flags (BootFlow steps, owner seed, residual closure markers).
- Sandboxed module behavior (legacy migration detect/block, Sheets role flags, outbox helpers).
- Electron security surfaces (preload allowlist patterns, print IPC wiring).
- Domain verify scripts (attendance, ledger, tax invoice, import, cloud-v2 unit facets).
- Historical phase scenario harnesses that write JSON evidence from **process-local** runs.

## What it does **not** cover

| Gap | Why it matters |
|-----|----------------|
| Installed Windows Setup EXE journeys | Only real customer path |
| Interactive Google OAuth consent + refresh | Tokens/accounts |
| Device A/B physical sync + conflict | Core product promise |
| Backup V2 disaster recovery on fresh machine | Data survival |
| Attachment hash across devices | File integrity |
| Responsive pixels at listed resolutions/scalings | Usability |
| Runtime console/main/IPC error sweep | Silent failures |
| Owner Hub destructive actions live | Org safety |
| Sheets live HTTP 401/403/429 | Activation registry resilience |
| Uninstall app-only vs full wipe human confirmation | Lifecycle |

## Selector/text-based tests vs runtime

Many V2-5.8/V2-5.9 tests **read source files** and assert regex (`test-v2-5-9-final-activation.js`, residual closure source checks). These are valuable **wiring guards**, not product validation.

`v2-5-9-ae-runtime.cjs` correctly stubs Scenarios A–E as `UNVERIFIED` until Installed EXE proof — do not reinterpret unit PASS as scenario PASS.

## Does 97/97 mean enough?

**No.** It means the engineering safety net for regressions in known modules is healthy. It does **not** mean the product is releasable. The project’s own gate enforces this by failing on UNVERIFIED UAT markers.

## Required UAT (minimum for release confidence)

1. Scenario A Device A/B (blocking)  
2. Scenario B New branch isolation  
3. Scenario C DR Backup V2  
4. Scenario D Owner Hub / contexts  
5. Scenario E Google OAuth/Drive/Sheets  
6. Responsive matrix + runtime error = 0  
7. Backup V1 hidden/disabled confirmation  

## Test strategy recommendation

Keep 97 unit/wiring tests. Add a **separate** “Windows Runtime Evidence” track that never auto-greens from CI smoke alone. Smoke ≠ Scenario A.
