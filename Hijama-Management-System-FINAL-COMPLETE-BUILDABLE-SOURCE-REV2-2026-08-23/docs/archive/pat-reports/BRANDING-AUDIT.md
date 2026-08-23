# Final Branding Audit

**Date:** 2026-07-03T17:14:15.673Z
**Result:** 24 PASS / 0 WARN / 0 FAIL — **100%**

## Single source: `branding.config.json`

Change company name, logo path, tagline, installer text, and copyright in one file.
Run `npm run generate:brand` before build.

## Results

- [PASS] **BR-01** branding.config.json exists
- [PASS] **BR-02** Required branding keys: 4 keys
- [PASS] **BR-03** Logo source file: 1254×1254 RGBA
- [PASS] **BR-04** Logo has alpha (transparency)
- [PASS] **BR-05** Build brand assets: BMP + NSIS + ICO
- [PASS] **BR-06** No logo upscale
- [PASS] **BR-07** Installer logo within source bounds: 130×130
- [PASS] **BR-08** Program icon valid Windows ICO: Program-Icon.ico
- [PASS] **BR-09** installer-branding.nsh generated
- [PASS] **BR-10** Program icon path: build/Program-Icon.ico
- [PASS] **BR-11** signAndEditExecutable unchanged
- [PASS] **BR-12** branding.config.json in build files
- [PASS] **BR-13** prebuild runs generate:brand
- [PASS] **BR-14** cupping-branding.js loaded
- [PASS] **BR-15** About uses BrandingEngine ids
- [PASS] **BR-16** No hardcoded logo path in About img: dynamic via engine
- [PASS] **BR-17** installer.nsh includes branding engine output
- [PASS] **BR-18** Electron reads branding.config.json
- [PASS] **BR-19** Runtime IPC app:getRuntimeInfo
- [PASS] **BR-20** About @100% scale: overflows:0 logoW:0
- [PASS] **BR-20** About @125% scale: overflows:0 logoW:0
- [PASS] **BR-20** About @150% scale: overflows:0 logoW:0
- [PASS] **BR-20** About @200% scale: overflows:0 logoW:0
- [PASS] **BR-21** About scaling aggregate: 0 overflow hints