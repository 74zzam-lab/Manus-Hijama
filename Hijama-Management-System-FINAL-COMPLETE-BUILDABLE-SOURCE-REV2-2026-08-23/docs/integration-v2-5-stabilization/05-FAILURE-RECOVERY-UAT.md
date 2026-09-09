# V2-5 Final Stabilization — Failure Recovery UAT

Evidence: `docs/integration-v2-5-stabilization/evidence/failure-recovery.json`

| Failure | Expected | Crash |
|---------|----------|-------|
| oauth_access_denied | soft ok:false | No |
| oauth_timeout | soft ok:false | No |
| oauth_port_in_use | flexible port / soft | No |
| rbac_session_required | soft IPC | No |
| vault_unreachable | soft skip activate | No |
| activation_already_used | hard deny | No |
| folder_not_found list | empty items | No |
| rate_limit | soft classify | No |
| permission_denied sheet | soft classify | No |
