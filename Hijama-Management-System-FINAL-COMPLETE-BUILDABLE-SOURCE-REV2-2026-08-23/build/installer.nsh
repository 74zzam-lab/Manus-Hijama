; ═══════════════════════════════════════════════════════════════════════════
; NajjarTech — Hijama Management System
; Custom NSIS installer / uninstaller (electron-builder assisted)
;
; CRITICAL: electron-builder runs `customUnInstall` AFTER deleting $INSTDIR.
; AppData policy + optional --uninstall-prep MUST run from `customRemoveFiles`
; (while the exe still exists) — EXCEPT during Upgrade (${isUpdated}), where
; userData must be preserved. `customUnInstall` is a second-pass for full wipe only.
; ═══════════════════════════════════════════════════════════════════════════

!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"
!include "installer-branding.nsh"

; Must match electron/main.js USER_DATA_FOLDER
!define NT_USER_DATA_NAME "Cupping Center"
!define NT_APP_EXE "Hijama Management System.exe"

Var NT_UninstallMode
; 0 = App-only (DEFAULT): keep ALL userData including license, device, branch, DB
; 1 = Explicit full wipe: permanently delete ALL Cupping Center userData

Var NT_InstallMode
; 0 = update (keep data)
; 1 = clean install + wipe live Cupping Center (backup kept if created)
; 2 = clean install + restore/keep data path (reinstall app only)

Var NT_BackupPath
Var NT_WipeShellSaved

; ─── Force current-user shell vars for Electron userData paths ───
!macro NT_PushCurrentUserShell
  StrCpy $NT_WipeShellSaved "0"
  ${If} $installMode == "all"
    SetShellVarContext current
    StrCpy $NT_WipeShellSaved "1"
  ${EndIf}
!macroend

!macro NT_PopCurrentUserShell
  ${If} $NT_WipeShellSaved == "1"
    SetShellVarContext all
  ${EndIf}
!macroend

; ─── Kill running app (unlock LevelDB / SQLite) — short waits; rely on graceful quit ───
!macro NT_KillAppProcessBody
  DetailPrint "Stopping ${NT_APP_EXE} if running..."
  nsExec::ExecToLog 'taskkill /IM "${NT_APP_EXE}" /T'
  Pop $0
  Sleep 400
  nsExec::ExecToLog 'taskkill /F /IM "${NT_APP_EXE}" /T'
  Pop $0
  Sleep 300
!macroend

Function un.NT_KillAppProcess
  !insertmacro NT_KillAppProcessBody
FunctionEnd

Function NT_KillAppProcess
  !insertmacro NT_KillAppProcessBody
FunctionEnd

; ─── Aggressive directory delete: cmd → PowerShell → NSIS RMDir ───
; $R8 = full path to delete
!macro NT_ForceRemoveDirBody
  Push $R0
  Push $R9
  StrCmp $R8 "" nt_fr_done
  DetailPrint "Removing: $R8"
  IfFileExists "$R8" 0 nt_fr_done
  StrCpy $R9 0
nt_fr_retry:
  ; 1) cmd rmdir is more reliable than NSIS RMDir on locked/partial trees
  nsExec::ExecToLog `"$SYSDIR\cmd.exe" /C rmdir /S /Q "$R8"`
  Pop $R0
  Sleep 400
  IfFileExists "$R8" 0 nt_fr_done

  ; 2) PowerShell fallback
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path -LiteralPath '$R8') { Remove-Item -LiteralPath '$R8' -Recurse -Force -ErrorAction SilentlyContinue }"`
  Pop $R0
  Sleep 400
  IfFileExists "$R8" 0 nt_fr_done

  ; 3) NSIS RMDir last resort
  RMDir /r "$R8"
  Sleep 400
  IfFileExists "$R8" 0 nt_fr_done

  IntOp $R9 $R9 + 1
  IntCmp $R9 5 nt_fr_giveup nt_fr_retry nt_fr_giveup
  Sleep 700
  Goto nt_fr_retry

nt_fr_giveup:
  DetailPrint "WARNING: still present after wipe attempts: $R8"
  RMDir /r /REBOOTOK "$R8"
nt_fr_done:
  Pop $R9
  Pop $R0
!macroend

Function NT_ForceRemoveDirImpl
  Pop $R8
  !insertmacro NT_ForceRemoveDirBody
FunctionEnd

Function un.NT_ForceRemoveDirImpl
  Pop $R8
  !insertmacro NT_ForceRemoveDirBody
FunctionEnd

!macro NT_ForceRemoveDir PATH
  Push "${PATH}"
  Call NT_ForceRemoveDirImpl
!macroend

!macro unNT_ForceRemoveDir PATH
  Push "${PATH}"
  Call un.NT_ForceRemoveDirImpl
!macroend

; Wipe every known Electron userData location (current-user shell vars)
!macro NT_WipeAllKnownUserDataDirs_Install
  !insertmacro NT_PushCurrentUserShell
  !insertmacro NT_ForceRemoveDir "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
  !insertmacro NT_ForceRemoveDir "$PROFILE\AppData\Local\${NT_USER_DATA_NAME}"
  !insertmacro NT_ForceRemoveDir "$APPDATA\${NT_USER_DATA_NAME}"
  !insertmacro NT_ForceRemoveDir "$LOCALAPPDATA\${NT_USER_DATA_NAME}"
  !insertmacro NT_ForceRemoveDir "$APPDATA\com.tadawi.cuppingcenter"
  !insertmacro NT_ForceRemoveDir "$LOCALAPPDATA\com.tadawi.cuppingcenter"
  !insertmacro NT_ForceRemoveDir "$APPDATA\Hijama Management System"
  !insertmacro NT_ForceRemoveDir "$LOCALAPPDATA\Hijama Management System"
  !insertmacro NT_ForceRemoveDir "$APPDATA\NajjarTech"
  !insertmacro NT_ForceRemoveDir "$LOCALAPPDATA\NajjarTech"
  !insertmacro NT_ForceRemoveDir "$APPDATA\hijama-management-system"
  !insertmacro NT_ForceRemoveDir "$LOCALAPPDATA\hijama-management-system"
  !insertmacro NT_PopCurrentUserShell
!macroend

!macro NT_WipeAllKnownUserDataDirs_Uninstall
  !insertmacro NT_PushCurrentUserShell
  !insertmacro unNT_ForceRemoveDir "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
  !insertmacro unNT_ForceRemoveDir "$PROFILE\AppData\Local\${NT_USER_DATA_NAME}"
  !insertmacro unNT_ForceRemoveDir "$APPDATA\${NT_USER_DATA_NAME}"
  !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\${NT_USER_DATA_NAME}"
  !insertmacro unNT_ForceRemoveDir "$APPDATA\com.tadawi.cuppingcenter"
  !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\com.tadawi.cuppingcenter"
  !insertmacro unNT_ForceRemoveDir "$APPDATA\Hijama Management System"
  !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\Hijama Management System"
  !insertmacro unNT_ForceRemoveDir "$APPDATA\NajjarTech"
  !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\NajjarTech"
  !insertmacro unNT_ForceRemoveDir "$APPDATA\hijama-management-system"
  !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\hijama-management-system"
  !insertmacro unNT_ForceRemoveDir "$DOCUMENTS\Hijama Management System"
  !insertmacro unNT_ForceRemoveDir "$DOCUMENTS\Cupping Center"
  !ifdef APP_PRODUCT_FILENAME
    !insertmacro unNT_ForceRemoveDir "$APPDATA\${APP_PRODUCT_FILENAME}"
    !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
  !endif
  !ifdef APP_PACKAGE_NAME
    !insertmacro unNT_ForceRemoveDir "$APPDATA\${APP_PACKAGE_NAME}"
    !insertmacro unNT_ForceRemoveDir "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
  !endif
  !insertmacro NT_PopCurrentUserShell
!macroend

; Strip Chromium license stores from an archive folder (keep business files)
!macro NT_StripLicenseFromArchive_Install ARCHIVE
  !insertmacro NT_ForceRemoveDir "${ARCHIVE}\Local Storage"
  !insertmacro NT_ForceRemoveDir "${ARCHIVE}\Session Storage"
  !insertmacro NT_ForceRemoveDir "${ARCHIVE}\IndexedDB"
  !insertmacro NT_ForceRemoveDir "${ARCHIVE}\CloudVault"
  !insertmacro NT_ForceRemoveDir "${ARCHIVE}\Service Worker"
  !insertmacro NT_ForceRemoveDir "${ARCHIVE}\Cookies"
!macroend

!macro NT_StripLicenseFromArchive_Uninstall ARCHIVE
  !insertmacro unNT_ForceRemoveDir "${ARCHIVE}\Local Storage"
  !insertmacro unNT_ForceRemoveDir "${ARCHIVE}\Session Storage"
  !insertmacro unNT_ForceRemoveDir "${ARCHIVE}\IndexedDB"
  !insertmacro unNT_ForceRemoveDir "${ARCHIVE}\CloudVault"
  !insertmacro unNT_ForceRemoveDir "${ARCHIVE}\Service Worker"
  !insertmacro unNT_ForceRemoveDir "${ARCHIVE}\Cookies"
!macroend

; ─── Backup user data before clean install (rename — frees canonical path) ───
Function NT_BackupUserData
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  StrCpy $NT_BackupPath ""
  !insertmacro NT_PushCurrentUserShell
  ; Prefer $PROFILE path (stable even if shell context drifts)
  StrCpy $R8 "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
  IfFileExists "$R8" 0 nt_backup_try_appdata
  Goto nt_backup_do
nt_backup_try_appdata:
  StrCpy $R8 "$APPDATA\${NT_USER_DATA_NAME}"
  IfFileExists "$R8" 0 nt_backup_skip
nt_backup_do:
  Call NT_KillAppProcess
  ${GetTime} "" "L" $R2 $R3 $R4 $R5 $R6 $R7 $R9
  StrCpy $NT_BackupPath "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}-preinstall-archived-$R4$R3$R2-$R6$R7"
  ClearErrors
  Rename "$R8" "$NT_BackupPath"
  IfErrors 0 nt_backup_renamed
    CreateDirectory "$NT_BackupPath"
    DetailPrint "Rename failed — copying user data to $NT_BackupPath"
    CopyFiles /SILENT "$R8\*" "$NT_BackupPath\"
    Push "$R8"
    Call NT_ForceRemoveDirImpl
    Goto nt_backup_done
  nt_backup_renamed:
    DetailPrint "User data archived (renamed) to: $NT_BackupPath"
  nt_backup_done:
  ; Always ensure live Cupping Center path is gone after backup
  Push "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
  Call NT_ForceRemoveDirImpl
  Push "$APPDATA\${NT_USER_DATA_NAME}"
  Call NT_ForceRemoveDirImpl
nt_backup_skip:
  !insertmacro NT_PopCurrentUserShell
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
FunctionEnd

; ─── Wipe live userData for fresh start ───
Function NT_WipeUserDataForCleanInstall
  Call NT_KillAppProcess
  DetailPrint "Clean install wipe — removing live Cupping Center..."
  !insertmacro NT_WipeAllKnownUserDataDirs_Install
  ; If we kept a preinstall archive, strip license storage from it
  ${If} $NT_BackupPath != ""
    DetailPrint "Stripping license stores from backup: $NT_BackupPath"
    !insertmacro NT_StripLicenseFromArchive_Install "$NT_BackupPath"
  ${EndIf}
  ; Verify
  IfFileExists "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}" 0 nt_wipe_ok
    DetailPrint "WARNING: Cupping Center still exists — final retry"
    Call NT_KillAppProcess
    Sleep 1500
    !insertmacro NT_WipeAllKnownUserDataDirs_Install
  nt_wipe_ok:
FunctionEnd

; ─── Installer: existing version check ───
Function NT_ChooseInstallMode
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  StrCmp $R0 "" 0 nt_im_found
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  StrCmp $R0 "" nt_im_done
nt_im_found:
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  StrCmp $R1 "" 0 nt_im_prompt
  ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  StrCmp $R1 "" 0 nt_im_prompt
  StrCpy $R1 "?"
nt_im_prompt:
  IfSilent nt_im_update nt_im_prompt_gui
nt_im_prompt_gui:
  MessageBox MB_YESNO|MB_ICONQUESTION "Existing version $R1 found.$\r$\n$\r$\nYES = Update and keep all data$\r$\nNO = Clean install with local backup first" IDYES nt_im_update IDNO nt_im_clean
  Abort

nt_im_update:
  StrCpy $NT_InstallMode "0"
  Return

nt_im_clean:
  Call NT_BackupUserData
  StrCmp $NT_BackupPath "" 0 nt_im_clean_backup
  MessageBox MB_OK|MB_ICONINFORMATION "No user data folder found - proceeding with fresh install."
  StrCpy $NT_InstallMode "1"
  Return

nt_im_clean_backup:
  DetailPrint "Backup saved to: $NT_BackupPath"
  MessageBox MB_YESNO|MB_ICONQUESTION "Backup completed.$\r$\n$\r$\nYES = Fresh start — DELETE Cupping Center (backup kept, license stripped)$\r$\nNO = Keep data for reinstall" IDYES nt_im_wipe IDNO nt_im_keep
  Abort

nt_im_wipe:
  StrCpy $NT_InstallMode "1"
  Return

nt_im_keep:
  ; Restore archived data back to Cupping Center for keep-data reinstall
  ${If} $NT_BackupPath != ""
    IfFileExists "$NT_BackupPath" 0 nt_im_keep_done
      ClearErrors
      Rename "$NT_BackupPath" "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
      IfErrors 0 nt_im_keep_done
        CreateDirectory "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
        CopyFiles /SILENT "$NT_BackupPath\*" "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}\"
  ${EndIf}
nt_im_keep_done:
  StrCpy $NT_InstallMode "2"
  Return

nt_im_done:
FunctionEnd

!macro customInit
  StrCpy $NT_InstallMode "0"
  StrCpy $NT_BackupPath ""
  StrCpy $NT_WipeShellSaved "0"
  Call NT_ChooseInstallMode
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "${BRAND_WELCOME_TITLE}"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "${BRAND_WELCOME_TEXT}"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "${BRAND_FINISH_TITLE}"
  !define MUI_FINISHPAGE_TEXT "${BRAND_FINISH_TEXT}"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "${BRAND_FINISH_RUN}"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInstall
  DetailPrint "Installing ${BRAND_PRODUCT} - ${BRAND_COMPANY}"
  ${If} $NT_InstallMode == "1"
    Call NT_WipeUserDataForCleanInstall
    ${If} $NT_BackupPath != ""
      DetailPrint "Previous data backed up at: $NT_BackupPath"
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Hijama Management System"
  !define MUI_WELCOMEPAGE_TEXT "Remove the program.$\r$\n$\r$\nDefault: Remove application only — KEEP all local data, license, device identity, and backups.$\r$\nFull wipe of local data is a separate explicit choice with confirmation."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

Function un.NT_ChooseUninstallMode
  ; Default = App-only (0). Full wipe = 1 only after explicit confirm (or /FULLWIPE silent flag).
  StrCpy $NT_UninstallMode "0"
  IfSilent nt_un_silent nt_un_interactive

nt_un_silent:
  ; Silent uninstall ALWAYS App-only unless explicit /FULLWIPE=1 (never from Auto Updater).
  ${GetParameters} $R9
  ClearErrors
  ${GetOptions} $R9 "/FULLWIPE=" $R8
  IfErrors nt_un_keep
  StrCmp $R8 "1" 0 nt_un_keep
  StrCpy $NT_UninstallMode "1"
  DetailPrint "Silent uninstall: /FULLWIPE=1 requested — full wipe enabled"
  Return

nt_un_interactive:
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove Hijama Management System from this computer?$\r$\n$\r$\nBy default, all local data and license are KEPT." IDYES nt_un_step2 IDNO nt_un_abort

nt_un_step2:
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove application only (recommended)?$\r$\n$\r$\nYES = Remove program; KEEP database, license, device ID, branch binding, settings, backups$\r$\nNO = Permanently delete ALL local application data (requires second confirmation)" IDYES nt_un_keep IDNO nt_un_confirm_wipe

nt_un_confirm_wipe:
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "FINAL CONFIRMATION$\r$\n$\r$\nThis will permanently delete:$\r$\n- Database and attachments$\r$\n- License and activation$\r$\n- Device identity and branch binding$\r$\n- Settings and local backups$\r$\n$\r$\nThis cannot be undone. Continue?" IDYES nt_un_complete IDNO nt_un_keep

  nt_un_keep:
    StrCpy $NT_UninstallMode "0"
    Return

  nt_un_complete:
    StrCpy $NT_UninstallMode "1"
    Return

  nt_un_abort:
    Abort
FunctionEnd

!macro customUnInit
  StrCpy $NT_UninstallMode "0"
  StrCpy $NT_BackupPath ""
  StrCpy $NT_WipeShellSaved "0"
  Call un.NT_ChooseUninstallMode
!macroend

Function un.NT_RunUninstallPrep
  Push $R0
  Push $R1
  Call un.NT_KillAppProcess
  Sleep 1000
  Call un.NT_KillAppProcess
  StrCpy $R0 "1"
  ; Exe still exists here when called from customRemoveFiles
  IfFileExists "$INSTDIR\${NT_APP_EXE}" 0 nt_prep_skip
    StrCpy $R1 '"$INSTDIR\${NT_APP_EXE}" --uninstall-prep'
    ${If} $NT_UninstallMode == "1"
      StrCpy $R1 '"$INSTDIR\${NT_APP_EXE}" --uninstall-prep --uninstall-full'
    ${EndIf}
    DetailPrint "Running uninstall prep: $R1"
    nsExec::ExecToLog `$R1`
    Pop $R0
    DetailPrint "Uninstall prep exit code: $R0"
    Goto nt_prep_done
  nt_prep_skip:
    DetailPrint "Exe missing — skipping Electron uninstall-prep (NSIS wipe will run)"
    StrCpy $R0 "2"
  nt_prep_done:
  Pop $R1
  Exch $R0
FunctionEnd

Function un.NT_ArchiveOneFolder
  ; $R7 = source, $R6 = timestamp suffix
  Push $R5
  IfFileExists "$R7" 0 nt_aof_done
    StrCpy $R5 "$R7-archived-$R6"
    ClearErrors
    Rename "$R7" "$R5"
    IfErrors 0 nt_aof_renamed
      CreateDirectory "$R5"
      CopyFiles /SILENT "$R7\*" "$R5\"
      Push "$R7"
      Call un.NT_ForceRemoveDirImpl
    nt_aof_renamed:
    DetailPrint "Archived: $R5"
    ; Strip license stores from archive
    !insertmacro NT_StripLicenseFromArchive_Uninstall "$R5"
    StrCmp $NT_BackupPath "" 0 nt_aof_done
    StrCpy $NT_BackupPath "$R5"
  nt_aof_done:
  Pop $R5
FunctionEnd

Function un.NT_ForceWipeAllUserData
  Call un.NT_KillAppProcess
  Sleep 1000
  Call un.NT_KillAppProcess
  DetailPrint "Force-removing Cupping Center and known userData folders..."
  !insertmacro NT_WipeAllKnownUserDataDirs_Uninstall

  ; Verify canonical path
  IfFileExists "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}" 0 nt_fw_try_appdata
    DetailPrint "WARNING: Cupping Center still present — retry"
    Call un.NT_KillAppProcess
    Sleep 1500
    !insertmacro NT_WipeAllKnownUserDataDirs_Uninstall
  nt_fw_try_appdata:
  IfFileExists "$APPDATA\${NT_USER_DATA_NAME}" 0 nt_fw_verify_ok
    Call un.NT_KillAppProcess
    Sleep 1500
    !insertmacro NT_WipeAllKnownUserDataDirs_Uninstall
  nt_fw_verify_ok:
FunctionEnd

Function un.NT_NsisArchiveThenWipe
  ; Used when Electron prep is unavailable/failed — archive then wipe live folder
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  StrCpy $NT_BackupPath ""
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  StrCpy $R6 "$R2$R1$R0-$R4$R5"

  !insertmacro NT_PushCurrentUserShell
  StrCpy $R7 "$PROFILE\AppData\Roaming\${NT_USER_DATA_NAME}"
  Call un.NT_ArchiveOneFolder
  StrCpy $R7 "$APPDATA\${NT_USER_DATA_NAME}"
  Call un.NT_ArchiveOneFolder
  !insertmacro NT_PopCurrentUserShell

  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

; Main uninstall data removal — must run WHILE exe still exists
Function un.NT_RemoveAppDataIfNeeded
  Push $R0
  Call un.NT_KillAppProcess

  ${If} $NT_UninstallMode == "1"
    ; Explicit full removal only — run Electron prep with --uninstall-full
    Call un.NT_RunUninstallPrep
    Pop $R0
    Call un.NT_ForceWipeAllUserData
    DetailPrint "Full local data removal completed (prep exit code $R0)."
    Pop $R0
    Return
  ${EndIf}

  ; Mode 0 App-only: do NOT touch userData, license, device, or branch.
  DetailPrint "App-only uninstall — preserving ALL Cupping Center userData (data + license + device + branch)."
  Pop $R0
FunctionEnd

; ═══════════════════════════════════════════════════════════════════════════
; customRemoveFiles — RUNS BEFORE $INSTDIR is deleted (exe still present)
; CRITICAL: must NOT wipe AppData during Upgrade (${isUpdated}).
; ═══════════════════════════════════════════════════════════════════════════
!macro customRemoveFiles
  ${if} ${isUpdated}
    DetailPrint "customRemoveFiles: UPDATE detected — preserving Cupping Center userData"
  ${else}
    DetailPrint "customRemoveFiles: uninstall — applying AppData policy (preserve by default)"
    Call un.NT_RemoveAppDataIfNeeded
  ${endif}

  ${if} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"
    Push ""
    Call un.atomicRMDir
    Pop $R0
    ${if} $R0 != 0
      DetailPrint "File is busy, aborting: $R0"
      Push ""
      Call un.restoreFiles
      Pop $R0
      Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
    ${endif}
  ${endif}

  RMDir /r $INSTDIR
!macroend

; Second-pass after INSTDIR is gone — only for explicit full wipe
!macro customUnInstall
  ${If} $NT_UninstallMode == "1"
    DetailPrint "customUnInstall: second-pass verify full wipe"
    Call un.NT_ForceWipeAllUserData
  ${Else}
    DetailPrint "customUnInstall: preserve mode — no second-pass AppData wipe"
  ${EndIf}
!macroend
