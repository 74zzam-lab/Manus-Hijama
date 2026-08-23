# Branding Assets Guide

Three design assets + one program icon. Installer BMP files are **generated** — not hand-edited.

## Design assets (replace before production build)

| File | Purpose |
|------|---------|
| `build/Program-Icon.ico` | **Program icon** — EXE, taskbar, installer (auto-generated from `buildIcons.iconSource` when missing/invalid) |
| `assets/NajjarTech-Logo.png` | NajjarTech company logo — Installer pages, About dialog, program info in settings |
| `branding/Center-Logo.png` | Default medical center logo — login, sidebar, dashboard, reports, printing (until user uploads a custom logo) |

## Generated assets (do not edit manually)

Created by `npm run generate:brand` from `assets/NajjarTech-Logo.png` and `buildIcons.iconSource`:

| File | Purpose |
|------|---------|
| `build/Program-Icon.ico` | Windows ICO for EXE + NSIS (16–256px) |
| `build/Installer-Sidebar.bmp` | Installer welcome sidebar |
| `build/Uninstaller-Sidebar.bmp` | Uninstaller sidebar |
| `build/Installer-Header.bmp` | Installer header strip |
| `build/installer-branding.nsh` | NSIS text defines from `branding.config.json` |

## Medical center branding

- Default: `branding/Center-Logo.png`
- Custom: user uploads in **Settings → Center branding** → stored as `settings.brandLogo`
- Custom logo replaces the default everywhere inside the app only
- Does **not** affect `NajjarTech-Logo.png` (installer/About uses company logo)
- `Program-Icon.ico` is generated from center logo by default — replace `buildIcons.iconSource` or supply a valid hand-made `.ico`

## Workflow

```bash
# 1. Replace the three design files (same names)
# 2. Regenerate installer graphics
npm run generate:brand
npm run audit:brand
# 3. Build installer locally
npm run build
```

## Configuration

Paths in `branding.config.json`:

- `assets.companyLogo` → `assets/NajjarTech-Logo.png`
- `assets.centerLogo` → `branding/Center-Logo.png`
- `buildIcons.programIcon` → `build/Program-Icon.ico`
- `buildIcons.iconSource` → `branding/Center-Logo.png` (PNG used to generate ICO)
