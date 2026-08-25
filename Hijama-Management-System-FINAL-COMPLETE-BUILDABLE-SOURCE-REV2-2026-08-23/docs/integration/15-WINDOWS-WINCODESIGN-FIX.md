# Fix: Windows build winCodeSign symlink failure

## Symptom

`npm run build:prod` on Windows fails after packaging with:

```text
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
...winCodeSign...\darwin\10.12\lib\libcrypto.dylib
...winCodeSign...\darwin\10.12\lib\libssl.dylib
```

## Root cause

Hybrid briefly set `signAndEditExecutable: true` so electron-builder would call rcedit and embed the program icon. That path downloads **winCodeSign**, whose archive includes **macOS symlinks**. Extracting them on Windows requires Developer Mode or admin symlink privilege. Without it, the build retries and fails — even though packaging itself already succeeded.

## Fix (this commit)

1. Keep `build.win.signAndEditExecutable: false` (no winCodeSign).
2. Embed `build/Program-Icon.ico` in the EXE via `build.afterPack` → `scripts/electron-builder-after-pack.cjs` using **`resedit`** (pure JS PE editor).
3. Keep `BrowserWindow({ icon })` for runtime window icon.
4. NSIS installer/uninstaller icons continue to use `build/Program-Icon.ico` paths (unaffected).

## What to run on Windows

```bat
rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
npm run build:prod
```

Expect log line:

```text
[afterPack] Embedded Program-Icon.ico into Hijama Management System.exe (resedit; no winCodeSign)
```

Then NSIS should complete without downloading winCodeSign.
