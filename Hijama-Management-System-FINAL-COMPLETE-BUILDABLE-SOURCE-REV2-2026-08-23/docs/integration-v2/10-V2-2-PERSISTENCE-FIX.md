# V2-2 — Persistence fix applied

## Change

Aligned Hybrid uninstall/update with Codex **preserve-by-default** policy.

### `build/installer.nsh`
- Upgrade (`${isUpdated}`): **does not** call AppData wipe.
- Default uninstall mode `"0"`: keep database/attachments/settings/backups; clear license markers.
- Explicit full wipe mode `"1"` only after user chooses NO on keep-data prompt.
- `customUnInstall` second-pass wipe only in mode `"1"`.

### `electron/uninstall-prep.js`
- `fullRemoval: false` → `wipeLicenseFromLegacyUserDataRoots` only; **live folder kept**.
- `fullRemoval: true` → wipe all legacy roots.

### Tests
- `test-nsis-cupping-center-wipe.js` rewritten for preserve policy.
- `verify-uninstall-prep.js` expects preserve + full-removal paths.
- vault CSP uninstall test updated.

## Still required on Windows

Manual matrix: Update / Repair / Uninstall-keep / Uninstall-wipe / Reinstall.
