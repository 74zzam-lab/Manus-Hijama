# UAT Checklist — Tadawi NextGen (Owner Hub / Licensing / Multi-Branch / Cloud)

**Scope:** RC3 + NextGen phases 21–40  
**Execution mode:** Manual UAT on Electron desktop build (`npm run build:prod`)

---

## 1) Activation + Owner Setup

- [ ] Fresh install opens login/boot without blank screen
- [ ] Activate with valid key succeeds
- [ ] `OwnerSetupState` becomes required on first activation if no owner profile
- [ ] Boot manager step blocks until owner profile is created (when required)
- [ ] Owner profile creation succeeds (username/password/recovery)
- [ ] Re-activation with same device remains valid
- [ ] Activation audit entry exists (`LICENSE_ACTIVATED`)

## 2) Legacy Migration

- [ ] Legacy center with consumed activation and manager account shows migration card in Owner Hub
- [ ] `runLegacyOwnerMigration` creates owner profile successfully
- [ ] Skip action records state and suppresses repeated prompt

## 3) Device Governance

- [ ] Register devices up to package limit succeeds
- [ ] Registering a new device over limit fails (`device_limit_reached`)
- [ ] Existing/grandfathered device re-registration still succeeds
- [ ] Device rename/disable/delete works from Owner Hub
- [ ] Device actions generate audit events

## 4) Branch Governance

- [ ] First branch can be created during setup
- [ ] Additional branch creation from non-owner-hub path is blocked (`owner_hub_required`)
- [ ] Owner Hub add/rename/disable/delete branch works
- [ ] Branch actions generate audit events
- [ ] Branch limit from license is enforced

## 5) Owner Mode / Branch Mode

- [ ] Owner can enter Branch Mode from Owner Hub branch card
- [ ] Active branch session changes accordingly
- [ ] Owner can return to Owner Mode
- [ ] Mode indicator updates correctly in Owner Hub

## 6) Licensing / Subscription Panel

- [ ] Owner Hub shows package/subscription/expiry/activation cards
- [ ] Open license management action works
- [ ] Open developer/renewal action works

## 7) Cloud Summaries / Reporting Baseline

- [ ] Branch summaries can be refreshed on-demand
- [ ] Summary card shows clients/cases/bookings/revenue/expenses/net per branch
- [ ] Refresh does not require downloading all branch databases

## 8) Backup / Restore Context

- [ ] Backup payload includes `organizationId`, `centerId`, `branchId`, `ownerMode`
- [ ] Cloud DB backup metadata includes same fields
- [ ] Auto backup layer preserves same metadata fields
- [ ] Restore still passes existing integrity validations

## 9) Compatibility & Regression

- [ ] Login flow unchanged (internal user/pass)
- [ ] Startup/boot/navigation remain stable
- [ ] `npm test` passes full suite
- [ ] `scripts/verify-nextgen-gate.js` passes

## 10) Final Sign-off Criteria

- [ ] No critical blocker in activation/login/cloud/backup
- [ ] No regression in phase 1–20 baselines
- [ ] Owner governance features validated end-to-end
- [ ] UAT defects triaged and closed or accepted

