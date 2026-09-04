# 03 — OAuth Real UAT (V2-4)

**Updated from automatic original-project discovery (no secret values in this file).**

## OAuth source scan

| Check | Result |
|-------|--------|
| OAuth source scan | **PASS** (comprehensive filesystem + archive scan) |
| Client ID discovered | **YES** — original `electron/cloud-oauth.config.json` / defaults / embedded |
| Client Secret discovered | **YES** — original `electron/cloud-oauth.embedded.json` (GOCSPX format; git-tracked legacy) |
| Refresh Token discovered | **NO** — not in repo, archives, machine store, or env |
| Refresh Token generated | **WAITING_GOOGLE_CONSENT** (PKCE loopback on `127.0.0.1:42813`) |
| Secrets exposed in logs/artifacts/chat | **NO** |
| GitHub Environment `v2-4-real-cloud` | **FAIL to configure** — integration token HTTP 403/404 |
| Local secure store | **YES** — `~/.config/NajjarTech/cloud-oauth.local.json` + `/tmp/v24-oauth-vault.json` mode 0600 |

Evidence: `docs/integration-v2-4/evidence/oauth-discovery-report.json`

## Runtime resolution priority (production)

1. `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` env  
2. OS machine store (`NajjarTech/cloud-oauth.local.json`)  
3. Developer encrypted override  
4. Gitignored bundled `cloud-oauth.config.json`  
5. Embedded legacy (last resort)

## Consent in progress

- Scope: `https://www.googleapis.com/auth/drive.file`  
- Flow: Authorization Code + PKCE, `access_type=offline`, `prompt=consent`  
- Chrome opened on agent display; **Google sign-in/consent is the only allowed interactive wait**  
- After consent: refresh token stored only in 0600 vault/machine store; harness `scripts/v2-4-real-drive-uat.cjs` runs Device A↔B on real Drive  

## Next after consent

1. Validate refresh → access token  
2. Real Drive A↔B push/pull/conflict/isolation  
3. Write `evidence/real-cloud-uat.json`  
4. Continue Windows installed UAT matrix  

**Do not ask the operator to paste Client ID/Secret** — they were discovered from the original project.

## Runtime OAuth evidence (2026-07-30)

- Authorization Code + PKCE completed on installed Chrome loopback (`127.0.0.1:42813`).
- Refresh token stored only in secure store (`~/.config/NajjarTech/cloud-oauth.local.json`, `/tmp/v24-oauth-vault.json`) mode `0600`.
- Refresh → access token: PASS (`evidence/oauth-refresh-test.json`).
- Drive about + upload probe: PASS (`evidence/drive-about-test.json`, `evidence/drive-upload-probe.json`).
- Scenarios 1–25 including token refresh / disconnect / rate-limit: PASS (`evidence/scenarios-1-25.json`).
- Secrets never printed in logs/artifacts/git.
