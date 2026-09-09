/**
 * PR13 — Shared benign operational error classification (renderer).
 * Never suppress programmer errors (ReferenceError, TypeError, etc.).
 */
(function (global) {
  'use strict';

  const PROGRAMMER_ERROR_PATTERNS = [
    /^ReferenceError:/i,
    /^TypeError:/i,
    /^SyntaxError:/i,
    /is not a function$/i,
    /cannot read propert/i,
    /undefined is not an object/i,
  ];

  /** Optional cloud modules that may be absent during early boot. */
  const OPTIONAL_MODULE_BOOT = /^(CloudBootstrap|CloudMeta|DriveBranchMigration|SyncEngine|LicenseLegacyBridge|CloudV2)\b/i;

  const BENIGN_SYNC_CODES = new Set([
    'no_center_id',
    'no_remote_versions',
    'no_versions_path',
    'not_found',
    'offline',
    'drive_not_connected',
    'no_backup_bridge',
    'push_failed',
  ]);

  function isProgrammerError(msg) {
    if (!msg) return false;
    const m = String(msg);
    if (PROGRAMMER_ERROR_PATTERNS.some((re) => re.test(m))) return true;
    if (/is not defined$/i.test(m)) {
      return !OPTIONAL_MODULE_BOOT.test(m);
    }
    return false;
  }

  function isBenignOperationalError(msg) {
    if (!msg) return true;
    if (isProgrammerError(msg)) return false;
    const m = String(msg);
    if (/is not defined$/i.test(m) && OPTIONAL_MODULE_BOOT.test(m)) return true;
    const lower = m.toLowerCase();
    if (BENIGN_SYNC_CODES.has(lower)) return true;
    return /^(no_remote_versions|no_versions_path|not_found|offline|no_center_id|push_failed)$/i.test(lower);
  }

  global.BenignOperationalErrors = {
    isProgrammerError,
    isBenignOperationalError,
    BENIGN_SYNC_CODES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
