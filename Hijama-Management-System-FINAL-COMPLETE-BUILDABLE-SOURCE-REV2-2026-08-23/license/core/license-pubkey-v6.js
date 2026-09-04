/**
 * Ed25519 public key for Commercial License V6 verification (client-side).
 * PRIVATE KEY must NEVER ship in the Electron client — only in tools/license-admin.
 *
 * Current embedded key = development/test key from tools/license-admin/keys/dev/.
 * Replace with your production public key before commercial release.
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  /** SPKI DER, base64 (Node crypto export type:spki format:der) */
  const ED25519_PUBLIC_KEY_SPKI_B64 = 'MCowBQYDK2VwAyEAdKYiE9RWzRfVQcEw3fqEZ1rjmdS+uHyrHzpMCU6bqOc=';

  const V6 = {
    SCHEMA_VERSION: 6,
    TOKEN_PREFIX: 'TDW6.',
    STORAGE_KEY: 'commercial_license_v6',
    REVOCATION_KEY: 'commercial_license_v6_revocations',
    PUBLIC_KEY_SPKI_B64: ED25519_PUBLIC_KEY_SPKI_B64,
    KEY_ID: 'dev-ed25519-2026',
  };

  CL.v6Constants = V6;
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
