/**
 * V2-5 Stabilization — Google Sheets access is via Apps Script vault only
 * (no Sheets API client in Electron). This module classifies vault/sheet errors
 * so UI never crashes on missing sheet / permission / rate-limit / timeout.
 */
(function (global) {
  'use strict';

  const CODES = Object.freeze({
    ok: 'ok',
    vault_not_configured: 'vault_not_configured',
    vault_unreachable: 'vault_unreachable',
    permission_denied: 'permission_denied',
    not_found: 'not_found',
    missing_sheet: 'missing_sheet',
    empty_sheet: 'empty_sheet',
    invalid_spreadsheet_id: 'invalid_spreadsheet_id',
    rate_limit: 'rate_limit',
    network_timeout: 'network_timeout',
    invalid_payload: 'invalid_payload',
    unknown: 'unknown'
  });

  function classifyVaultError(err, data) {
    const msg = String((err && (err.message || err.error || err)) || (data && data.error) || '').toLowerCase();
    const status = Number((data && data.status) || (err && err.status) || 0);
    if (!msg && !status) return CODES.unknown;
    if (/timeout|etimedout|aborted/.test(msg)) return CODES.network_timeout;
    if (/429|rate.?limit|quota/.test(msg) || status === 429) return CODES.rate_limit;
    if (/403|permission|access.?denied|insufficient/.test(msg) || status === 403) return CODES.permission_denied;
    if (/404|not.?found|missing.?sheet|no such sheet/.test(msg) || status === 404) {
      return /sheet/.test(msg) ? CODES.missing_sheet : CODES.not_found;
    }
    if (/invalid.?spreadsheet|spreadsheet.?id/.test(msg)) return CODES.invalid_spreadsheet_id;
    if (/empty/.test(msg)) return CODES.empty_sheet;
    if (/failed to fetch|network|csp|blocked/.test(msg)) return CODES.vault_unreachable;
    return CODES.unknown;
  }

  function softResult(code, message, extra) {
    return Object.assign({
      ok: false,
      soft: true,
      crash: false,
      code,
      error: code,
      message: message || code
    }, extra || {});
  }

  /**
   * Wrap any vault/sheet async call so rejections become soft structured results.
   */
  const SOFT_CODES = new Set([
    CODES.vault_not_configured,
    CODES.vault_unreachable,
    CODES.network_timeout,
    CODES.rate_limit
  ]);

  async function safeCall(label, fn) {
    try {
      const result = await Promise.resolve(typeof fn === 'function' ? fn() : fn);
      if (result && result.ok === false) {
        const code = classifyVaultError(result, result.data || result);
        // Network/config failures are soft; business vault rejections stay hard (no crash).
        if (SOFT_CODES.has(code) || result.soft || result.skipped) {
          return softResult(code, result.message || result.error || label, { data: result });
        }
        return Object.assign({
          ok: false,
          soft: false,
          crash: false,
          code: code || result.error || CODES.unknown,
          error: result.error || code || CODES.unknown,
          message: result.message || result.error || label
        }, result && typeof result === 'object' ? result : {});
      }
      if (result && result.skipped) {
        return {
          ok: true,
          skipped: true,
          soft: true,
          crash: false,
          code: result.reason || CODES.vault_not_configured,
          message: result.message || result.reason || label
        };
      }
      return Object.assign({ ok: true, crash: false, code: CODES.ok }, result && typeof result === 'object' ? result : { value: result });
    } catch (err) {
      const code = classifyVaultError(err);
      return softResult(code, err && err.message ? err.message : String(err), { label });
    }
  }

  async function fetchBundle(productKey) {
    return safeCall('fetchBundle', () => global.LicenseVaultClient?.fetchBundleFromVault?.(productKey));
  }

  async function activate(options) {
    return safeCall('activate', () => global.LicenseVaultClient?.activateOnVault?.(options));
  }

  async function status(licenseId, productKey) {
    return safeCall('status', () => global.LicenseVaultClient?.checkStatus?.(licenseId, productKey));
  }

  /**
   * Official role — Sheets/Apps Script vault is NOT operational Source of Truth.
   * SoT = SQLite (ops) + signed Drive license.json (branches/devices runtime).
   * Vault = License Registry / activation integration only.
   * Manual spreadsheet edits must NEVER overwrite Drive/SQLite operational data.
   */
  const SHEETS_ROLE = Object.freeze({
    role: 'license_registry_integration',
    isSourceOfTruth: false,
    isOperationalStore: false,
    priority: {
      operationalData: 'sqlite',
      branchDeviceRuntime: 'drive_signed_license_json',
      licenseKeyConsume: 'apps_script_vault',
    },
    conflictRule: 'vault_never_overwrites_drive_or_sqlite_ops',
  });

  /** Documented capability matrix — Sheets API not in-process. */
  function capabilityMatrix() {
    return {
      transport: 'google_apps_script_webapp',
      sheetsApiInElectron: false,
      role: SHEETS_ROLE,
      operations: {
        read: 'via_vault_status_fetchBundle',
        write: 'via_vault_activate',
        append: 'via_vault_server_side',
        update: 'via_vault_server_side',
        delete: 'not_exposed_to_client',
        batchUpdate: 'not_exposed_to_client'
      },
      errorHandling: Object.keys(CODES),
      simulatedClientCodes: ['401', '403', '404', '429', 'timeout', 'offline']
    };
  }

  /** Harness helpers — classify HTTP-like failures without crashing. */
  function simulateHttpFailure(status) {
    const map = {
      401: CODES.permission_denied,
      403: CODES.permission_denied,
      404: CODES.not_found,
      429: CODES.rate_limit,
      timeout: CODES.network_timeout,
      offline: CODES.vault_unreachable,
    };
    const code = map[String(status)] || CODES.unknown;
    return softResult(code, 'simulated_' + status, { simulated: true, status });
  }

  const api = {
    CODES,
    SHEETS_ROLE,
    classifyVaultError,
    softResult,
    safeCall,
    fetchBundle,
    activate,
    status,
    capabilityMatrix,
    simulateHttpFailure,
  };

  global.GoogleSheetsOps = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
