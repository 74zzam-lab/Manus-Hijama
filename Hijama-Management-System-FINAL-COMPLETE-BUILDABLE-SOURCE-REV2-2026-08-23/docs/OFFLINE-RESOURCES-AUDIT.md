# Offline Resources Audit

## External Resources Found

| Resource | URL | Used By | Required? | Works Offline? | Security Impact | Action |
|----------|-----|---------|-----------|----------------|-----------------|--------|
| Google Fonts CSS | `fonts.googleapis.com` | index.html, print templates | **Was required** | No | Low | **REPLACED** with local woff2 files |
| Google Fonts Files | `fonts.gstatic.com` | Loaded by Google Fonts CSS | **Was required** | No | Low | **REPLACED** with local woff2 files |
| QR Server API | `api.qrserver.com` | `thermalQrImageUrl()` | Original code | No | Low | **NOT CHANGED** (original behavior) |
| Google OAuth | `accounts.google.com` | License activation, Drive | Required for online features | N/A (online feature) | None (expected) | Keep |
| Google Drive API | `www.googleapis.com` | Cloud backup | Required for online features | N/A (online feature) | None (expected) | Keep |
| Google Apps Script | `script.google.com` | License vault | Required for online features | N/A (online feature) | None (expected) | Keep |
| Time APIs | `timeapi.io`, `worldtimeapi.org` | Clock verification | Optional | N/A (online check) | None (expected) | Keep |
| WhatsApp | `wa.me` | Messaging links | Optional | N/A (external link) | None | Keep |

## CDN Dependencies

| CDN | Found? | Details |
|-----|--------|---------|
| cdnjs.com | No | Not used |
| jsdelivr.net | No | Not used |
| unpkg.com | No | Not used |
| Bootstrap CDN | No | Not used |
| Font Awesome CDN | No | Not used |

## Post-Fix Status

After this fix:
- **Zero external font requests** — all fonts loaded from `assets/fonts/`
- **All CSS/JS/HTML** served from local `file://` protocol
- **CSP remains strict** — no external CDN domains added
- **Offline operation** — full UI renders without internet
- **QR server** — still external in original code (not part of this fix scope)
