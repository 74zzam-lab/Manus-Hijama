# V2-5.9 Owner Hub / Sync / prompt() Runtime Fix

## Issues from Windows screenshots

1. `SYSTEM_ERROR: prompt() is not supported` on every Owner Hub branch/device button
2. Owner Hub shows `OWNER_RECOVERY_REQUIRED` / «مطلوب» after Owner login + password change
3. Backup page toast `rbac_session_required` while Google shows ✅
4. Personal device after local restore on reception: Owner setup again / password change again (sync not pushing users)
5. Duplicate Owner Hub buttons on Backup settings page

## Fixes

| Area | Change |
|------|--------|
| Dialogs | New `cloud/tdw-dialogs.js` — `tdwAskText` / `tdwAskPassword` / `tdwConfirm`; polyfill prompt/confirm; Owner Hub + migration converted |
| Owner state | Seeded/restored passworded Owner without crypto profile → `OWNER_EXISTS` (not RECOVERY_REQUIRED) |
| Profile heal | `OwnerProfile.ensureProfileFromOwnerUser` on password change; shows one-time recovery code |
| RBAC | `ensureRbacSessionBound()` awaited before Drive upload/sync; Arabic message for session errors |
| Backup page | Removed duplicate Owner Hub CTAs; clarified OAuth vs Cloud V2 vs local |
| Post-restore | Local/file restore triggers `ActivationSyncDefaults` + `runCloudDbBackupNow('post-*-restore')` |
| Owner Mode | Explained in Hub: Owner Mode = cross-branch read overview; Branch Mode = write inside one branch |

## Owner Mode (ما هو؟)

- **Owner Mode:** نظرة عامة لكل الفروع والأجهزة (قراءة تشغيلية، يمنع الكتابة العرضية عبر الفروع).
- **Branch Mode:** الدخول لفرع محدد للعمل اليومي (إضافة حالات، حجوزات، …).
- الفائدة: فصل إدارة الشبكة عن تشغيل فرع واحد بأمان.

## Follow-up (rbac / logout / new branch)

| Area | Change |
|------|--------|
| Confirm | `dialog:confirmSync` via Electron `showMessageBoxSync` — logout/deletes no longer show «confirm غير مدعوم» |
| RBAC | Empty users KV trusts claim; `__dev__` + `skipLookup`; flush users **after** bind; Backup V2 calls `ensureRbacSessionBound` |
| New branch | Auto Branch Mode + clients UI filtered via `filterForActiveView` (new branch starts empty) |
| Ops guide | `docs/integration-v2-5-9/BRANCH-SYNC-OPS-GUIDE.md` |

## Still requires Windows UAT

Real-time sync proof, Drive backup after restore, and zero `prompt` errors must be verified on Setup EXE.
Ready for release / main: **NO** until 26 requirements PASS.
