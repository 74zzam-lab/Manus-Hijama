# Operator E2E Workflow Lock — Installed Setup EXE only

Use with `PRODUCTION-LOCK.md`. Every row must be proven on **Installed** `HijamaManagement-Setup-*.exe` (not `npm start`).

**Evidence:** `result: PASS`, `installedSetupExeProof: INSTALLED`, `setupSha256`, logs/screenshots, `zeroRuntimeErrors: true`.

---

## 0. Install baseline

| Step | Pass criteria |
|------|----------------|
| Clean profile install | EXE installs, app launches, no crash |
| Console / runtime | 0 blocking errors on cold start |
| SHA-256 | Matches release notes |

---

## 1. التفعيل · Activation

| Workflow | Pass criteria |
|----------|----------------|
| License key entry | Preview shows package/expiry before commit |
| V5 / long keys | Accepted or clear error |
| Activation consumed | Second device shows expected gate |
| Post-activation | Dashboard reachable, license label correct |

---

## 2. الترخيص · License

| Workflow | Pass criteria |
|----------|----------------|
| Local license.json | Present, signed fields readable |
| Drive license pull | Recovery path if local missing |
| Package limits | Branches/devices/users enforced in UI |
| Renewal / upgrade | Label updates without corrupting data |

---

## 3. Google Drive

| Workflow | Pass criteria |
|----------|----------------|
| OAuth login | Clinic Google account, no popup block |
| Token persist | Restart → still connected |
| Disconnect policy | Center-level; logout does not break center Google |
| Folder layout | Center root visible under NajjarTech |

---

## 4. المزامنة · Sync

| Workflow | Pass criteria |
|----------|----------------|
| Readiness | Ready state or clear Arabic missing list |
| Manual sync | Push/pull completes |
| UNSAFE / pause | Recoverable pause + resume button works |
| Dual device | A writes → B sees after poll |
| Legacy branchId | Wizard completes if legacy rows exist |
| Conflict | UI shows conflict, no silent overwrite |

---

## 5. النسخ المحلي · Local backup

| Workflow | Pass criteria |
|----------|----------------|
| Backup V2 create | File produced, listed in history |
| Local path | Writable, no permission error |
| Auto backup | Trigger if configured |

---

## 6. النسخ السحابي · Cloud backup

| Workflow | Pass criteria |
|----------|----------------|
| Auto cloud backup | Date stamped on Drive |
| Manual backup | Optional encrypt off by default |
| Backup V1 | Customer path disabled / invisible |

---

## 7. الاستعادة · Restore

| Workflow | Pass criteria |
|----------|----------------|
| Fast discovery | Completes without hang |
| Confirmed restore | User confirms before overwrite |
| Backup V2 restore | Wizard completes, data intact |
| Mandatory pre-restore snapshot | Runs before destructive ops |

---

## 8. الفروع · Branches

| Workflow | Pass criteria |
|----------|----------------|
| Branch lock (device) | Device bound to branch |
| Branch switch (owner) | Confirm dialog, data refreshes |
| Branch isolation | A branch data not visible in wrong branch |
| Add branch (owner) | Owner Hub path, not duplicate CenterSetup |

---

## 9. المستخدمين · Users & RBAC

| Workflow | Pass criteria |
|----------|----------------|
| Owner login | Password persist after restart |
| Roles | Manager / accountant / doctor scopes |
| Owner recovery | Support-only emergency path |
| Remove/demote owner | Policy gates enforced |

---

## 10. الباقات · Packages

| Workflow | Pass criteria |
|----------|----------------|
| Package features | Addon pages hidden when off |
| 4 canonical packages | Match license display |
| Trusted gates | Blocked action shows clear message |

---

## 11. الطباعة · Print

| Workflow | Pass criteria |
|----------|----------------|
| A4 reports | Preview before print where labeled |
| Thermal receipt | Prints or preview; fonts/QR OK |
| Payroll / ledger | Preview path works |

---

## 12. التقارير · Reports

| Workflow | Pass criteria |
|----------|----------------|
| Today / monthly / VAT | Data matches operational DB |
| Doctor performance | Branch scope correct |
| Attendance / expenses | Export + preview |

---

## 13. الضرائب · Taxes (VAT)

| Workflow | Pass criteria |
|----------|----------------|
| VAT report | Numbers match cases |
| Simplified tax invoice | ZATCA fields if enabled |
| Invoice types | Normal vs simplified |

---

## 14. الصلاحيات · Permissions

| Workflow | Pass criteria |
|----------|----------------|
| Page gates | Unauthorized → blocked |
| Print / export | RBAC on reports |
| Owner Hub | Manager/accountant scope |

---

## 15. Scenario A–E (release gate)

| ID | Name | Blocking |
|----|------|----------|
| A | Dual device Google UAT | **YES** |
| B | New branch | **YES** |
| C | Backup V2 DR | **YES** |
| D | Owner Hub | **YES** |
| E | Google OAuth / Drive / Sheets | **YES** |

Validate:

```bash
npm run v2-5-10:validate-ae
npm run verify:v2-5-9-release-gate
```

Both must exit **0** before Production Candidate.

---

## Failure template (per bug)

```json
{
  "symptom": "",
  "reproSteps": [],
  "rootCause": "",
  "fixCommit": "",
  "exeTag": "uat-v2-5-10-<run_id>",
  "setupSha256": "",
  "scenarioRetest": "FULL",
  "result": "PASS|FAIL"
}
```
