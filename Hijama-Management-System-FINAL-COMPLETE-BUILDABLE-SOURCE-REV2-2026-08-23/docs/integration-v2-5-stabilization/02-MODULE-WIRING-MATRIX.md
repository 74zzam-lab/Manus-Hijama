# V2-5 Final Stabilization — Module Wiring Matrix

| Module | Entry | Wired | Notes |
|--------|-------|-------|-------|
| rbac-session | electron/rbac-session.js | YES | Public Google/license/cache channels |
| ipc-validate | electron/security/ipc-validate.js | YES | Soft RBAC |
| google-drive | electron/cloud-providers/google-drive.js | YES | PKCE + soft connect |
| oauth-loopback | electron/cloud-providers/oauth-loopback.js | YES | Flexible port |
| token-store | electron/cloud-providers/token-store.js | YES | Encrypted |
| google-sheets-ops | cloud/google-sheets-ops.js | YES | index.html script + vault wrappers |
| license-vault-client | cloud/license-vault-client.js | YES | Soft network |
| license-activation-gate | cloud/license-activation-gate.js | YES | Uses GoogleSheetsOps.activate |
| license-validator-v2 | license/engine/license-validator-v2.js | YES | Uses GoogleSheetsOps.fetchBundle |
| owner-profile | cloud/owner-profile.js | YES | currentUserIsOwner |
| owner-hub | cloud/owner-hub.js | YES | Mutate Owner-only UI |
| role-policy | cloud/role-policy.js | YES | ORGANIZATION_OWNER_ROLES |
| device-registry | cloud/device-registry.js | YES | Owner authz |
| device-cache | cloud/device-cache.js | YES | Soft writes |
| index.html login/users | index.html | YES | Owner options + mint guard |
