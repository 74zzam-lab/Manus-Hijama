# Tadawi License Admin (V6 / Ed25519)

Offline tool for **issuing, renewing, revoking, and migrating** commercial licenses.

## Critical security rule

- **Private key** lives only under `tools/license-admin/keys/` (never under `license/`, `electron/`, or `cloud/`).
- The Electron client embeds **public key only** (`license/core/license-pubkey-v6.js`).
- `tools/` is **not** included in `electron-builder` `build.files`.

## Dev keys

`keys/dev/` contains a **development/test** keypair checked in so CI and Phase 3 tests can sign fixtures.

For production:

```bash
node tools/license-admin/src/cli.js generate-keypair --dir tools/license-admin/keys/production
export TADAWI_LICENSE_PRIVATE_KEY=tools/license-admin/keys/production/ed25519-private.pem
node tools/license-admin/src/cli.js export-public
# paste SPKI base64 into license/core/license-pubkey-v6.js
```

## Commands

```bash
# Issue a signed V6 license + compact token
node tools/license-admin/src/cli.js issue \
  --id TDW-2026-000001 \
  --name "Tadawi Center" \
  --package PRO \
  --users 5 --branches 1 \
  --token

# Verify
node tools/license-admin/src/cli.js verify --license tools/license-admin/fixtures/TDW-2026-000001.v6.json

# Revoke
node tools/license-admin/src/cli.js revoke --id TDW-2026-000001

# Migrate from a client V5→V6 migration request JSON
node tools/license-admin/src/cli.js migrate-v5 --request request.json --out migrated.v6.json
```

## Online API (client interface only in Phase 3)

Designed endpoints (not hosted yet):

- `POST /licenses/activate`
- `POST /licenses/validate`
- `POST /licenses/deactivate`
- `GET /licenses/revocations`

See `license/api/license-online-client.js`.
