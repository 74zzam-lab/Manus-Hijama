# Baseline Validation — True Original Source Verification

## Question: Was `ed5d6f3` the last visually correct version?

**YES — CONFIRMED.**

### Evidence

1. The ZIP archive `docs/archive/Cupping System Management.zip` contains the original project as uploaded by the developer (commit `76e0e51`).

2. `ed5d6f3` (Phase 1: stabilize) extracted this ZIP into the repo without modifying any source files:
   ```
   diff <(git show ed5d6f3:index.html) "ZIP/index.html" → 0 lines different
   diff "ZIP/license-v2-drawer.css" "current/license-v2-drawer.css" → 0 lines different
   diff "ZIP/client-care-plan.css" "current/client-care-plan.css" → 0 lines different
   ```

3. The index.html in `ed5d6f3` is **byte-for-byte identical** to the ZIP original (25,309 lines).

4. All standalone CSS files are **byte-for-byte identical** between ZIP, `ed5d6f3`, and current HEAD.

### Conclusion

`ed5d6f3` IS the true original baseline. The visual regressions were introduced in commits **after** `ed5d6f3`.

---

## First Visually Broken Commit

**`9c21720` — Phase 2: harden Electron security (sandbox, IPC, CSP)**

This commit introduced `electron/security/window-policy.js` with a Content Security Policy that blocks Google Fonts CDN. See `docs/TRUE-ROOT-CAUSES.md` for full analysis.
