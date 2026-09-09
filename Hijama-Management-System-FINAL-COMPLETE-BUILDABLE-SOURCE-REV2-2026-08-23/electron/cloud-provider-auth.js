'use strict';

/**
 * Shared Google / cloud provider authentication contract (Main process).
 * Discovery, Backup, Sync bootstrap, and restore must use the same definition.
 */
function isCloudProviderAuthenticated(status) {
  if (!status || typeof status !== 'object') return false;
  if (status.connected !== true) return false;
  if (status.needsReauth === true) return false;
  return true;
}

function assertCloudProviderAuthenticated(status, options = {}) {
  const provider = options.provider || status?.provider || 'google';
  if (!status || typeof status !== 'object') {
    return {
      ok: false,
      error: 'google_not_connected',
      reason: 'google_status_contract_mismatch',
      provider,
    };
  }
  if (status.ok === false && status.connected !== true) {
    return {
      ok: false,
      error: 'google_not_connected',
      reason: 'google_status_contract_mismatch',
      provider,
      detail: status.message || null,
    };
  }
  if (status.connected !== true) {
    return {
      ok: false,
      error: 'google_not_connected',
      reason: status.needsReauth ? 'needs_reauth' : 'disconnected',
      provider,
      detail: status.message || null,
    };
  }
  if (status.needsReauth === true) {
    return {
      ok: false,
      error: 'google_token_unavailable',
      reason: 'needs_reauth',
      provider,
      detail: status.message || null,
    };
  }
  return { ok: true, status, provider };
}

module.exports = {
  isCloudProviderAuthenticated,
  assertCloudProviderAuthenticated,
};
