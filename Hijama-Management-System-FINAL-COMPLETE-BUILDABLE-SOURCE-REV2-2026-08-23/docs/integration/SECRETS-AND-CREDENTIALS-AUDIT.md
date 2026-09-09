# Secrets and Credentials Audit

**Policy:** Do not print secret values. Paths + guidance only.

## Findings (Cursor tip / Hybrid base)

| Location | Kind | Action |
|----------|------|--------|
| `electron/cloud-oauth.embedded.json` | OAuth `clientSecret` | Pre-existing on tip; **do not import Codex secret**. Prefer env/`oauth-machine-store` long-term |
| `electron/cloud-oauth.config.json` | Placeholder/test secret | Keep non-production placeholders |
| `electron/cloud-oauth.config.local.json` | Local override | Ensure gitignored if real |
| Communication providers | Runtime `apiKey` fields | User-stored; not hardcoded |
| License V6 | Public verify keys in repo; private keys in admin tool | Do not embed private keys in app |

## Findings (Codex extract — do not port)

| Location | Kind | Action |
|----------|------|--------|
| `electron/cloud-oauth.config.json` | Live-looking `GOCSPX-…` secret | **REJECT port**; treat as compromised for any shared artifact; rotate if ever used |
| Packaged embedded OAuth | Installed-app secret | Do not copy into Hybrid |

## Recommendations

1. Hybrid keeps Cursor tip OAuth resolution path (machine store + embedded as already on tip).
2. Never commit new secrets.
3. Prefer OS credential vault / env for CI: `GOOGLE_OAUTH_CLIENT_SECRET`.
4. Redact secrets in logs (Codex `security/redaction.js` is a future optional port).

## Scan notes

Searched for `client_secret`, `clientSecret`, `api_key`, `apiKey`, `private_key`, `BEGIN PRIVATE` under electron/cloud trees. Values intentionally omitted from this document.
