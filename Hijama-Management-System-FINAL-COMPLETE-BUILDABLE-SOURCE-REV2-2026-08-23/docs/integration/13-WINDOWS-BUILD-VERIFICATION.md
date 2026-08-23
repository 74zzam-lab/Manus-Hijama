# Windows Build Verification

## Executed in this environment (Linux)

```bash
HYBRID_DISABLE_RCEDIT=1 npm run build:dir
```

**Result:** PASS — produced `dist/win-unpacked/Hijama Management System.exe`

Packaged verified in `app.asar`:
- `assets/fonts/*.woff2`
- local QR vendor assets / cupping scripts (via package files globs)
- `database/**/*`, `electron/**/*`

## Icon embed note

`signAndEditExecutable` stays **false** on all hosts. Enabling it triggers electron-builder’s `winCodeSign` download/extract, which fails on Windows without symlink privilege (`SeCreateSymbolicLinkPrivilege` / Developer Mode) because the archive contains darwin `.dylib` symlinks.

Hybrid embeds `Program-Icon.ico` with **`afterPack` + `resedit`** instead. `BrowserWindow.icon` remains set for window/taskbar fallback.

### Windows build recovery (user machine)

If a previous failed build left a broken cache:

```bat
rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
npm run build:prod
```

## Windows host checklist (required before Stable)

| Check | Status here |
|-------|-------------|
| EXE icon | CONFIG PASS / RUNTIME PENDING Windows |
| Installer icon | CONFIG PASS / RUNTIME PENDING |
| Shortcut icon | PENDING Windows install |
| Taskbar icon | PENDING |
| Title bar icon | BrowserWindow set; PENDING visual |
| ARP icon | PENDING |
| Uninstaller icon | CONFIG PASS / RUNTIME PENDING |
| Offline fonts | ASAR PASS |
| Offline QR | ASAR + tests PASS |
| Installed app smoke | PENDING Windows |
