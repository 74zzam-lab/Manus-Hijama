# V2-5.9 Live Windows UAT (Setup EXE only)

**Ready for main: NO** · Fill only after installed Windows Setup EXE (not `npm start`).

| # | Scenario | Result | Logs | Screenshots/Video | Console errors | Notes | Root Cause | Fix Commit | Re-Test |
|---|----------|--------|------|-------------------|----------------|-------|------------|------------|---------|
| S1 | Old customer new device (auto discovery → pull → branch → device → restart → sync) | UNVERIFIED | | | | | | | |
| S2 | New customer (key → custom first branch → device → restart → data source) | UNVERIFIED | | | | | | | |
| S3 | Local data source + sync to Device B | UNVERIFIED | | | | | | | |
| S4 | Cloud restore Device B | UNVERIFIED | | | | | | | |
| S5 | Owner Hub + Branch Drawer + RO pages + password reset | UNVERIFIED | | | | | | | |
| S6 | Device A/B CRUD/attachments/offline/conflict/backup | UNVERIFIED | | | | | | | |
| W10 | Windows 10 Setup EXE | UNVERIFIED | | | | | | | |
| W11 | Windows 11 Setup EXE | UNVERIFIED | | | | | | | |

## Owner account (mandatory UAT — no plaintext seed in evidence)

| Check | Result | Evidence |
|-------|--------|----------|
| Seeded `owner` exists once (hash only; never print seed password) | UNVERIFIED | |
| Role = owner | UNVERIFIED | |
| First login forces password change (modal cannot dismiss / Escape / overlay) | UNVERIFIED | |
| Seed password rejected after change | UNVERIFIED | |
| Google account never becomes Owner | UNVERIFIED | |
| Reset Owner Password (Support/DevTools) works | UNVERIFIED | |
| Owner login after Restart / Update | UNVERIFIED | |
| No Owner Bootstrap for normal Google user | UNVERIFIED | |
| No duplicate Owner after restore/migration | UNVERIFIED | |
| Seed password absent from UI, logs, evidence | UNVERIFIED | |

## Build artifacts (fill on Windows)

| Field | Value |
|-------|-------|
| Setup EXE path | |
| win-unpacked path | |
| SHA-256 | |
| Electron runtime | |
| Node runtime | |
| Windows version | |
| Display scaling tested | |

**Ready for main: NO** until S1–S6 + Owner + Responsive all PASS and release gate exits 0.
