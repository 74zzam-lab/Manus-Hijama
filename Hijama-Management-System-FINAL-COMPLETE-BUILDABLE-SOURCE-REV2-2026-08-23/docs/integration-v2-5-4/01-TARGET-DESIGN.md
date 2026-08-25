# V2-5.4 — Target Design

## Layers

1. **UI hide** — unauthorized screens/menus/widgets/reports/exports hidden (not merely disabled).
2. **Route reject** — `showPage` / direct navigation denied + audited.
3. **Service reject** — privileged renderer helpers re-check PermissionPolicy/RolePolicy.
4. **IPC reject** — Electron main validates trusted session role before mutate channels.
5. **Repository scope** — writes + reads enforce BranchScope; cross-branch ID access denied.
6. **Tamper reject** — forged `currentUser.role` / `branchId` fails authoritative checks.

## Roles in product path

`owner`, `admin` (branch admin), `reception`, `accountant`, `employee`, `custom` (+ clinical via employee+doctorId / practitioner mapping). Dead/unused login roles documented or wired.
