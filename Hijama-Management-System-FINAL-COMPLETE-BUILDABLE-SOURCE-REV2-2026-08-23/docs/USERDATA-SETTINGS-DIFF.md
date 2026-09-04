# UserData & Settings Diff

## Settings Initialization

### Merge Pattern (SAFE)
```javascript
// index.html — settings are loaded from DB with defaults as fallback
const settings = DB.get('settings', defaultSettings);
```

`DB.get(key, default)` returns the stored value if it exists, or `default` if not. This is **NOT** a destructive spread — saved user settings are preserved.

### defaultSettings Changes

| Key | Original Value | Current Value | Impact |
|-----|---------------|---------------|--------|
| `centerNameEn` | `''` | `APP_META.productName \|\| 'Hijama Management System'` | New installs only |
| All other keys | (values) | **Identical** | None |

### Settings Spread Order

No dangerous spread patterns found. Settings are always loaded as a complete object from DB, not merged with defaults at runtime.

## LocalStorage / DB Key Changes

### New Keys Added to `_DB_AUTH_EXEMPT` (pre-auth write allowlist)
```
__tdw_boot_wizard__, __tdw_boot_complete__, __tdw_cloud_license__,
__tdw_device_config__, __tdw_sync_state__, __tdw_active_branch__,
__tdw_versions__, __tdw_drive_folders__, __tdw_audit_log__,
__tdw_audit_pending_drive__, __tdw_settings_guard__,
__tdw_settings_restore__, __tdw_conflict_queue__, __tdw_conflict_archive__,
__tdw_record_locks__, __tdw_repo_revisions__, __tdw_restore_staging__,
__tdw_sync_guard__, __tdw_pending_identity_change__,
commercial_license_data_v2, commercial_license_audit_v2
```

**Impact:** These keys can now be written before user login. Previously they were blocked by `dbSetGuarded()`. This is a **necessary fix** — cloud bootstrap must store data before login.

### New Keys in `clearAllLicenseStorage` Wipe
```
commercial_license_v6, __tdw_owner_*, __tdw_boot*,
commercial_license_v6_prev_marker, __tdw_owner_profile__,
__tdw_owner_setup__, __tdw_owner_migration__,
__tdw_boot_wizard__, __tdw_boot_done__
```

**Impact:** License wipe now also clears Owner and Boot state. This is correct behavior — a full license reset should clear everything.

## Migration Analysis

### No Settings Migration Exists
- No `migrateSettings()` function
- No `normalizeSettings()` function  
- No `resetSettings()` function
- No `localStorage.clear()` calls
- No code that overwrites saved settings with defaults

### Schema Version
- `APP_META.dbSchemaVersion` in index.html: `3` (unchanged)
- `branding.config.json` `dbSchemaVersion`: changed from `3` to `4`
- **No migration code fires on this version bump** — the schema version in `branding.config.json` is metadata, not used to trigger migrations in the renderer

### SQLite Migration (Phase 4)
- `database/migrations/001_initial.js` creates tables but does NOT modify localStorage/DB settings
- `database/migrate-from-json.js` reads localStorage tables into SQLite but does NOT modify the source data
- `cupping-sqlite-bridge.js` provides a bridge but does NOT reset settings

## Theme Settings

### Theme Persistence
- Theme is stored in `settings` object as part of the general settings
- `applyTheme()` function is identical between versions
- `THEMES` object is identical
- Default theme is identical

### No Theme Reset
No code resets theme to default after the initial application.

## Electron userData

### Path: `%APPDATA%/Cupping Center` (unchanged)
The `USER_DATA_FOLDER` constant is identical in both versions.

### No userData Wipe on Update
The NSIS installer wipe only runs on explicit uninstall, not on update.

## Conclusion

| Issue | Found? | Details |
|-------|--------|---------|
| Destructive settings spread | **No** | Settings loaded as complete object from DB |
| Settings migration reset | **No** | No migration functions exist |
| Theme reset | **No** | Theme persistence unchanged |
| Key rename breaking old data | **No** | All keys identical |
| localStorage.clear() | **No** | Only in explicit license wipe function |
| Cache invalidation | **No** | No cache mechanisms involved |

**Settings and stored data are NOT the cause of visual regressions.** The cause is CSP blocking font loading at runtime.
