# V2-5.9 Modal Resolution Fix — Report

## Root cause

Auth/activation surfaces used conflicting shells:

1. Full-viewport flex centering **without** safe padding → cards could clip at short/scaled heights.
2. Whole `.modal` scrolled (`overflow-y: auto` on the dialog) → footers/buttons left the viewport.
3. BootFlow CTAs (`.bf-actions`) lived **inside** the scroll body while sticky CSS targeted non-existent `.bf-body` / `.bf-header` classes.
4. Flex children lacked `min-height: 0`, so overflow was suppressed.
5. Activation sections mixed flex-column accordion with wrap; mid-width layouts elongated vertically instead of using a controlled 3→2→1 grid.
6. Hard `94vh` / fixed drawer heights fought Electron DPI scaling.

## Affected pages

Login · Activation & Licensing · BootFlow wizard · Google connect modal · Owner forced password change · Center Setup · License manage tabs

## Shared layout changed

Unified **`modal-shell`** (aliases `.tdw-modal`, `.bf-card.modal-shell`, `.login-box.modal-shell`, `.lic-box.modal-shell`, `.cs-modal.modal-shell`):

- Overlay: `display: grid; place-items: center; overflow: hidden` + safe padding
- Shell: `grid-template-rows: auto minmax(0, 1fr) auto` + `max-height: calc(100dvh - 2*safe)`
- Body: `min-height: 0; overflow-y: auto; overscroll-behavior: contain`
- Footer: sticky, `flex-shrink: 0`, actions always visible

## Files changed

| File | Change |
|------|--------|
| `renderer/styles/design-system.css` | Safe area vars, modal-shell, grid 3→2→1 @1100/720, stepper compact |
| `index.html` | Login/License/CP/Google shell HTML; modal/login/lic CSS |
| `cloud/boot-flow-ui.js` | Actions → footer; STEP_SHORT; safe area styles v259 |
| `cloud/center-setup-ui.js` | Shell + scroll body |
| `tests/baseline/test-v2-5-9-final-activation.js` | Structural asserts |
| `scripts/verify-v2-5-9-completion.cjs` | Gate checks for shell/safe-area |
| `docs/integration-v2-5-9/RESPONSIVE-UAT.md` | Acceptance checklist (still UNVERIFIED) |

## Fixed-height rules removed / replaced

- `max-height: 94vh` / `calc(94vh - 48px)` on lic-box variants → `calc(100dvh - 2*clamp(24px,5vh,48px))`
- BootFlow `min(94vh,920px)` → dvh − safe area
- Center setup `92vh` + whole-modal scroll → shell + body scroll

## Wrap rules changed

- Prefer `activation-grid` / `lic-activation-grid` **grid** (3→2→1) over flex-wrap stacks
- Login/footer actions: `nowrap` → 2-col grid ≤640px
- BootFlow actions/nav: nowrap / 2-col grid ≤640px
- License tabs: horizontal scroll, no wrap

## Scroll container

Single scroll: `.modal-body` / `.bf-card-body` / `.lic-scroll` / `.cs-body`  
Overlay itself: `overflow: hidden` (no dual page+modal scroll)

## Safe area

`--tdw-safe-block: clamp(24px, 5vh, 48px)`  
`--tdw-safe-inline: clamp(16px, 3vw, 32px)`  
Applied to login, license, BootFlow, modal overlays, center setup

## Footer behavior

Sticky footer outside scroll body; BootFlow `#bf-step-actions` + `#bf-step-nav` in `.bf-card-footer`

## Resolutions / Scaling tested

| Item | Status |
|------|--------|
| Resolutions 1024–2560 | **UNVERIFIED** (requires Windows Setup EXE) |
| Scaling 100–175% | **UNVERIFIED** |
| Screenshots | **UNVERIFIED** |
| Runtime errors | **UNVERIFIED** on Setup EXE |

## Tests added

Unit/source checks for safe-area, modal-shell grid, login shell, change-password footer, BootFlow footer actions, STEP_SHORT, 100dvh.

## Windows Setup EXE / Release gate

- Setup EXE interactive UAT: **NOT DONE** on Linux agent
- Requirements: still **0 PASS / 26 UNVERIFIED** until Windows matrix filled
- Release gate: **FAIL** while UNVERIFIED markers remain
- Ready for release / main: **NO**

Do **not** mark V2-5.9 complete until every modal/button is proven reachable on Setup EXE at all listed resolutions and scalings.

## Follow-up (runtime screenshots)

| Bug | Fix |
|-----|-----|
| `#lic-step-manage` shown with auth (both stacked, dual Close) | Removed `display:grid !important`; `licSetVisibleStep('auth'\|'manage')` + `.lic-step-visible` — manage **only after** developer login |
| BootFlow Data Source buttons overlapping/clipped | Restore choices moved to scrollable `.bf-choice-actions` in body; footer keeps Back/Next only; actions stack vertically |
