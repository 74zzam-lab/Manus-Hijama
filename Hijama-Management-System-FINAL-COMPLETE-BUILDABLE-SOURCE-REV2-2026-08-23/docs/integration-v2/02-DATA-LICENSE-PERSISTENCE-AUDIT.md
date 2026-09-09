# 02 — Data / License Persistence Audit (RELEASE BLOCKER)

## Canonical runtime path (Hybrid + Codex)

```text
%APPDATA%\Cupping Center
  (= Roaming\Cupping Center)
```

Forced in `electron/main.js`:

```js
const USER_DATA_FOLDER = 'Cupping Center';
app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_FOLDER));
```

`appId` / `productName` are **not** used for the live data folder when packaged.

## Asset locations

| Asset | Path under Cupping Center |
|-------|---------------------------|
| SQLite | `database\tadawi.db` |
| Attachments | `attachments\` |
| Settings | `settings\` |
| Backups | `Backups\` (V2/Emergency) |
| License cache | `cache\<centerId>\license.json` |
| OAuth tokens | `CloudVault\tokens\` |
| License (renderer) | Chromium Local Storage keys |
| Device fingerprint | Computed (includes userData path hash) |

`package.json` `nsis.deleteAppDataOnUninstall = false` — **overridden** by custom NSIS.

## Hybrid wipe machinery (evidence)

### `build/installer.nsh`

1. **`customRemoveFiles`** (runs while EXE still exists, including during **Upgrade** file replacement):

```nsis
Call un.NT_RemoveAppDataIfNeeded   ; ALWAYS
...
RMDir /r $INSTDIR
```

2. **`un.NT_RemoveAppDataIfNeeded`** ends with:

```nsis
nt_un_wipe_live:
  ; ALWAYS delete live Cupping Center
  Call un.NT_ForceWipeAllUserData
  Call un.NT_ForceWipeAllUserData
```

3. Uninstall welcome text: folder is **always** deleted.
4. Default uninstall mode init `"1"` (full).
5. Clean install mode `"1"` calls `NT_WipeUserDataForCleanInstall`.

### `electron/uninstall-prep.js`

Non-full (`--uninstall-prep` without `--uninstall-full`): archives then **`wipeAllLegacyUserDataRoots`** → live folder deleted anyway.

### Empty DB after wipe

`database/connection.js` `openDatabase` creates directories + migrates empty schema → app “works” with zero clients.

## Codex contrast (preserve policy)

- Hook: `customUnInstall` only (no Hybrid always-wipe `customRemoveFiles`).
- Mode `0`: preserve DB/attachments/settings/backups; license wipe only.
- Mode `1`: full wipe after explicit choice.
- `uninstall-prep` non-full: wipe license in place; **keep** live folder.

## Scenario matrix

| Scenario | Expected | Actual (Hybrid code) | Root Cause | Required Fix |
|----------|----------|----------------------|------------|--------------|
| Update | Preserve all | **Wipes userData** during upgrade uninstall hook | `customRemoveFiles` → always `ForceWipe` | Skip AppData wipe when `${isUpdated}` / install mode update |
| Repair install | Preserve all | Same wipe risk if uninstall path runs | Same | Same |
| Uninstall without wipe | Preserve work data | **Always deletes** Cupping Center (optional archive first, license stripped) | Policy + `nt_un_wipe_live` | Default keep live; license-only wipe |
| Explicit full wipe | Delete after confirmation | Works (mode 1) | Intended | Keep, clearer UX |
| New machine | Cloud bootstrap | Empty local until Drive hydrate | Expected | Later V2-6 auto snapshot |

## Policy required (product)

- Update never deletes data/license.
- Default uninstall preserves work data.
- Full wipe = separate confirmed path.
- Stable userData name (`Cupping Center`) — already true.
- `appId` stable — already true.
- Migrate any legacy folders once with Backup V2 first.

## Files to change (V2-2)

1. `build/installer.nsh` — align with Codex preserve; never wipe on update.
2. `electron/uninstall-prep.js` — non-full = license-only.
3. `tests/baseline/test-nsis-cupping-center-wipe.js` — expect preserve-on-uninstall.
4. Optional: one-time legacy folder migrator + Backup V2 pre-step.
