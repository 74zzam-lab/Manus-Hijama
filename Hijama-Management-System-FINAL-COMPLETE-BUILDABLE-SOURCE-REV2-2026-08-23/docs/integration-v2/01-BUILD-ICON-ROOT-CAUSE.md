# 01 — Build / Icon Root Cause

## Pipelines compared

### Codex (`Codex-20Phase` extract)

```text
npm run build:prod
→ npm run build:win / build:desktop
→ electron-builder --win (builder ^26, Electron ^39)
→ package.json build.win.signAndEditExecutable = true
→ downloads winCodeSign → rcedit embeds build/Program-Icon.ico into EXE
→ NSIS uses installerIcon/uninstallerIcon/headerIcon = Program-Icon.ico
```

No `afterPack` hook observed for icons; icon success depends on winCodeSign/rcedit succeeding on the builder host.

### Hybrid (`integration/hybrid-production-candidate` / this V2 branch)

```text
npm run build:prod
→ generate-oauth-config --strict
→ npm run build
→ scripts/run-win-build.cjs
→ npx electron-builder --win --x64  (builder ^25.1.8, Electron ^33)
→ package.json build.win.signAndEditExecutable = false
→ afterPack: scripts/electron-builder-after-pack.cjs (resedit embeds ICO)
→ validate-production-deps
→ NSIS same icon field paths as Codex
```

`BrowserWindow({ icon: APP_ICON })` set in `electron/main.js` for window/taskbar fallback.

## Config matrix

| Item | Codex | Hybrid tip `729b7eb` |
|------|-------|----------------------|
| `appId` | `com.tadawi.cuppingcenter` | same |
| `productName` | Hijama Management System | same |
| `win.icon` | `build/Program-Icon.ico` | same |
| NSIS installer/uninstaller/header icons | Program-Icon.ico | same |
| `signAndEditExecutable` | **true** | **false** |
| `afterPack` | none | **resedit hook** |
| `deleteAppDataOnUninstall` | false | false |
| ICO sizes | 16–256 (no 24) | 16,24,32,48,64,128,256 |
| `run-win-build` disables rcedit on Windows? | N/A | **No** — current script does not force-disable on Windows; it relies on afterPack |

## Why Codex showed the correct icon

winCodeSign/rcedit stamped the ICO into the PE resources when their Windows build environment could extract winCodeSign (or already had a good cache).

## Why Hybrid users saw wrong/missing icon

1. **Tip `5589018` (user download):** before afterPack/resedit fix; prior attempt used `signAndEditExecutable:true` which **failed** on many Windows PCs with symlink errors → incomplete/aborted icon embed path.
2. Even with correct NSIS *installer* icons, **EXE/shortcut/taskbar** need PE resource embed or BrowserWindow icon.
3. Config PASS ≠ Artifact PASS — Windows Explorer must be checked after a successful build that logs:
   `[afterPack] Embedded Program-Icon.ico into Hijama Management System.exe (resedit; no winCodeSign)`

## Does Hybrid use the audited config?

Yes on tip `729b7eb+`: `package.json` `afterPack` + `signAndEditExecutable:false`. Users on `5589018` do **not** have that fix.

## V2-1 required proof (Windows)

Validate icons on: unpacked EXE, installer EXE, installed app, Desktop, Start Menu, Taskbar, window, ARP, uninstaller.
