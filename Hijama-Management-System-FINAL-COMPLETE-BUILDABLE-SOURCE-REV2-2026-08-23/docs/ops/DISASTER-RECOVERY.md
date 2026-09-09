> Hybrid adaptation note: sourced from Codex-20Phase docs; CSP/fonts/QR remain Cursor tip policy (local only).

# Disaster recovery plan

## Objectives and command

The clinic must define its contractual RPO/RTO. Recommended starting targets are RPO ≤ 24 hours for an isolated full backup and RTO ≤ 4 hours for a single workstation, then validate by drills. One incident commander authorizes restore/rollback; one operator executes; one reviewer verifies finance and clinical samples.

## Database corruption

Stop Tadawi and sync on all devices, copy the entire user-data directory read-only, record hashes, and run health checks on a copy. Restore the newest verified Backup V2 through staging. Validate schema, branch totals, latest visits/invoices, attachments, users, and sync queue before reopening.

## Lost or failed device

Revoke its cloud/session access, preserve any recoverable disk, install a trusted signed build on the replacement, activate the correct license, restore the latest verified backup, then synchronize. Compare the recovered last transaction time with the RPO and reconcile later paper/remote transactions.

## Failed update

Do not use full uninstall. Preserve the automatic pre-update backup and logs, stop sync, and follow `release/ROLLBACK-2.0.0.md`. Deploy the prior signed tag, verify schema compatibility, or restore the pre-update Backup V2 if necessary. Re-enable work only after smoke and totals checks.

## Corrupt or wrong backup

Never force extraction. Preserve the file and error, try another independently stored verified backup, and confirm password custody. A manifest/hash/authentication failure means the file is unusable. Do not overwrite current data while testing candidates.

## Lost license

Preserve clinic data, verify customer identity and device, revoke the lost device if applicable, and issue/import a new signed License V6 activation. Never copy a license from another center or disable signature/device checks.

## Account compromise

Disable the account, revoke all sessions/devices and relevant OAuth credentials, rotate passwords/secrets, preserve audit and sync events, identify branch/data scope, and review exported/changed records. Notify the responsible privacy/security authority according to clinic policy and law.

## Cloud failure or conflicting devices

Continue offline locally; do not delete the outbox. Disable repeated manual retries, keep a verified local backup, and wait for connectivity/service recovery. On return, review conflicts—especially financial and delete-versus-update—before reopening all devices.

For a backend database failure, stop API writes, preserve audit/storage evidence, restore the latest verified PostgreSQL snapshot to an isolated environment, apply tested migrations, compare tenant/branch record versions and the last sequence, then restore traffic gradually. Rotate JWT/storage/database secrets if compromise is possible. Object storage is restored independently and must be reconciled by tenant/branch key, checksum, and encryption metadata.

## Full branch recovery

Freeze operations and record the last accepted number per financial entity. Restore on an isolated replacement, activate branch/user access, verify branch-only and aggregate reports, attachments, printers, cash session, numbering sequences, pending sync/conflicts, and a sample clinical timeline. Run user acceptance, document data gap/reconciliation, then switch traffic to the recovered branch.

## Evidence and closure

For every incident retain timeline, people, versions, hashes, backup IDs, checks performed, data gap, approvals, and corrective action. Keep emergency backup/rollback material until business and security owners sign closure; then dispose of it under the retention policy.
