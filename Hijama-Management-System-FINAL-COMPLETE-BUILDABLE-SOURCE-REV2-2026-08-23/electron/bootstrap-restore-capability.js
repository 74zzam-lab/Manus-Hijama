'use strict';

/**
 * RC Hotfix Round 5 — short-lived bootstrap restore authorization (pre-login BootFlow only).
 * Single-use, bound to webContents + center + remotePath. Not a general RBAC bypass.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertCloudProviderAuthenticated } = require('./cloud-provider-auth');

const CAPABILITY_TTL_MS = 5 * 60 * 1000;

const BOOTSTRAP_RESTORE_CHANNELS = new Set([
  'backup:v2:restoreUnified',
  'backup:v2:restoreFromCloudRemote',
]);

let deps = {
  getUserDataPath: () => '',
  readKv: () => null,
  getCloudStatus: async () => ({ connected: false }),
  assertDriveReadable: null,
  verifyFileIdMetadata: null,
  readLicense: () => ({ ok: false }),
  getSession: () => null,
};

const BOOTSTRAP_ERROR_ALIASES = Object.freeze({
  google_not_connected: 'bootstrap_restore_google_unavailable',
  google_token_unavailable: 'bootstrap_restore_google_unavailable',
  google_status_contract_mismatch: 'bootstrap_restore_google_unavailable',
  license_not_verified: 'bootstrap_restore_license_missing',
  restore_scope_mismatch: 'bootstrap_restore_center_mismatch',
  drive_download_auth_failed: 'backup_remote_probe_failed',
  invalid_backup_path: 'backup_remote_not_found',
});

const capabilities = new Map();

function configure(nextDeps) {
  deps = { ...deps, ...nextDeps };
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/').trim();
}

function newCapabilityId() {
  return `brc-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, cap] of capabilities) {
    if (cap.expiresAt <= now || cap.consumed) capabilities.delete(id);
  }
}

function revokeForSender(webContentsId) {
  for (const [id, cap] of capabilities) {
    if (cap.webContentsId === webContentsId) capabilities.delete(id);
  }
}

function mapBootstrapError(error, extra = {}) {
  const code = BOOTSTRAP_ERROR_ALIASES[error] || error || 'restore_authorization_required';
  if (error === 'restore_scope_mismatch' && extra.branchMismatch) {
    return 'bootstrap_restore_branch_mismatch';
  }
  if (error === 'restore_scope_mismatch' && extra.centerMismatch) {
    return 'bootstrap_restore_center_mismatch';
  }
  return code;
}

function resolveLicense(centerId) {
  // Bootstrap authority is main-process device state only. Renderer snapshots are data, never authority.
  const cached = deps.readLicense(centerId);
  if (cached?.ok && cached.data?.centerId && String(cached.data.centerId) === String(centerId)) {
    return { ok: true, data: cached.data, source: 'device_cache' };
  }
  return { ok: false, error: 'license_not_verified' };
}

function isApprovedLocalBackupPath(userDataPath, localPath) {
  const root = path.resolve(userDataPath || '', 'Backups', 'V2');
  const candidate = path.resolve(localPath || '');
  return !!root && candidate.startsWith(root + path.sep);
}

function readSettingsIdentity(userDataPath) {
  try {
    const settingsPath = path.join(userDataPath, 'settings', 'app.json');
    if (!fs.existsSync(settingsPath)) return {};
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) || {};
    const cloud = settings.cloudV2 || settings.cloud || {};
    return {
      centerId: String(cloud.centerId || settings.centerId || '').slice(0, 128),
      branchId: String(cloud.branchId || settings.branchId || settings.activeBranchId || '').slice(0, 128),
      organizationId: String(cloud.organizationId || cloud.centerId || settings.centerId || '').slice(0, 128),
    };
  } catch {
    return {};
  }
}

function isBootstrapPhase() {
  const wizard = deps.readKv('__tdw_boot_wizard__', null);
  if (wizard && wizard.syncDone === true) return false;
  return true;
}

async function issueRestoreCapability(event, request) {
  purgeExpired();
  const req = request || {};
  if (req.bootFlow !== true) {
    return { ok: false, error: 'restore_authorization_required', message: 'BootFlow context required' };
  }

  const session = deps.getSession(event);
  if (session && session.rank >= 4) {
    return { ok: false, error: 'use_rbac_session', message: 'Use logged-in RBAC session for restore' };
  }

  if (!isBootstrapPhase()) {
    return { ok: false, error: 'bootstrap_restore_not_allowed_app_ready' };
  }

  const centerId = String(req.centerId || '').trim();
  const branchId = String(req.branchId || '').trim();
  const remotePath = normalizePath(req.remotePath);
  const googleFileId = String(req.googleFileId || req.fileId || '').trim();
  const localPathRaw = String(req.localPath || req.filePath || '').trim();
  const localPath = localPathRaw ? path.resolve(localPathRaw) : null;
  const source = req.source === 'local' || (localPath && !remotePath && !googleFileId) ? 'local' : 'cloud';
  let backupId = String(req.backupId || googleFileId || remotePath || (localPath ? path.basename(localPath) : '') || '').trim();
  const expectedSize = Number(req.expectedSize || req.expectedSizeBytes || 0) || null;
  const expectedModifiedAt = req.expectedModifiedAt || null;
  const diagnosticId = String(req.diagnosticId || '').trim() || null;

  if (!centerId || !backupId) {
    return {
      ok: false,
      error: mapBootstrapError('restore_authorization_required'),
      stage: 'authorization',
      diagnosticId,
    };
  }

  let boundFileMeta = null;
  if (source === 'local') {
    if (!localPath || !/\.tdw$/i.test(localPath) || !isApprovedLocalBackupPath(deps.getUserDataPath(), localPath)) {
      return {
        ok: false,
        error: mapBootstrapError('invalid_backup_path'),
        stage: 'authorization',
        diagnosticId,
      };
    }
    if (!fs.existsSync(localPath)) {
      return {
        ok: false,
        error: 'backup_remote_not_found',
        message: 'Local backup file not found',
        stage: 'authorization',
        diagnosticId,
      };
    }
    backupId = backupId || path.basename(localPath);
    try {
      boundFileMeta = { size: fs.statSync(localPath).size, name: path.basename(localPath) };
    } catch { /* best effort */ }
  } else {
    if (!remotePath && !googleFileId) {
      return {
        ok: false,
        error: mapBootstrapError('restore_authorization_required'),
        stage: 'authorization',
        diagnosticId,
      };
    }
    if (remotePath && (!/\.tdw$/i.test(remotePath) || !remotePath.includes('Backups/V2'))) {
      return {
        ok: false,
        error: mapBootstrapError('invalid_backup_path'),
        stage: 'authorization',
        diagnosticId,
      };
    }

    const google = await deps.getCloudStatus('google');
    const authGate = assertCloudProviderAuthenticated(google);
    if (!authGate.ok) {
      return {
        ok: false,
        error: mapBootstrapError(authGate.error || 'google_not_connected'),
        reason: authGate.reason || 'google_status_contract_mismatch',
        message: authGate.detail || undefined,
        stage: 'authorization',
        diagnosticId,
      };
    }

    if (googleFileId && typeof deps.verifyFileIdMetadata === 'function') {
      const fileGate = await deps.verifyFileIdMetadata(googleFileId, {
        expectedSize,
        expectedModifiedAt,
        remotePath,
      });
      if (!fileGate?.ok) {
        return {
          ok: false,
          error: mapBootstrapError(fileGate.error || 'drive_download_auth_failed'),
          reason: fileGate.reason || 'file_id_unreachable',
          stage: 'authorization',
          diagnosticId,
          detail: fileGate.detail || null,
        };
      }
      boundFileMeta = fileGate.item || null;
    } else if (typeof deps.assertDriveReadable === 'function' && remotePath) {
      const driveGate = await deps.assertDriveReadable(remotePath);
      if (!driveGate?.ok) {
        return {
          ok: false,
          error: driveGate.error === 'drive_download_auth_failed' && driveGate.reason === 'path_not_found'
            ? 'backup_remote_not_found'
            : mapBootstrapError(driveGate.error || 'drive_download_auth_failed'),
          reason: driveGate.reason || 'drive_path_unreachable',
          stage: 'authorization',
          diagnosticId,
          detail: driveGate.detail || null,
        };
      }
      boundFileMeta = driveGate.item || null;
    }
  }

  const settingsId = readSettingsIdentity(deps.getUserDataPath());
  if (settingsId.centerId && settingsId.centerId !== centerId) {
    return {
      ok: false,
      error: mapBootstrapError('restore_scope_mismatch', { centerMismatch: true }),
      stage: 'authorization',
      diagnosticId,
    };
  }

  const licRes = resolveLicense(centerId);
  const lic = licRes?.ok ? licRes.data : null;
  if (!lic || !lic.centerId) {
    return {
      ok: false,
      error: mapBootstrapError('license_not_verified'),
      stage: 'authorization',
      diagnosticId,
      licenseSource: licRes?.source || null,
    };
  }
  if (String(lic.centerId) !== centerId) {
    return {
      ok: false,
      error: mapBootstrapError('restore_scope_mismatch', { centerMismatch: true }),
      stage: 'authorization',
      diagnosticId,
    };
  }

  const licensedBranchIds = (Array.isArray(req.licensedBranchIds) ? req.licensedBranchIds : (lic.branches || []))
    .filter((b) => b && (typeof b === 'string' || b.active !== false))
    .map((b) => (typeof b === 'string' ? b : b.id))
    .filter(Boolean);

  const effectiveBranch = branchId || settingsId.branchId || lic.branchId || '';
  if (effectiveBranch && licensedBranchIds.length && !licensedBranchIds.includes(effectiveBranch)) {
    return {
      ok: false,
      error: mapBootstrapError('restore_scope_mismatch', { branchMismatch: true }),
      stage: 'authorization',
      diagnosticId,
    };
  }

  const webContentsId = event?.sender?.id;
  if (webContentsId == null) return { ok: false, error: 'no_sender' };

  revokeForSender(webContentsId);

  const capId = newCapabilityId();
  const cap = {
    id: capId,
    webContentsId,
    source,
    centerId,
    organizationId: String(req.organizationId || lic.organizationId || centerId).slice(0, 128),
    branchId: effectiveBranch,
    remotePath,
    localPath: source === 'local' ? localPath : null,
    googleFileId: googleFileId || boundFileMeta?.id || null,
    backupId,
    expectedSize: expectedSize || Number(boundFileMeta?.size || 0) || null,
    expectedModifiedAt: expectedModifiedAt || boundFileMeta?.modifiedAt || null,
    licensedBranchIds,
    issuedAt: Date.now(),
    expiresAt: Date.now() + CAPABILITY_TTL_MS,
    consumed: false,
  };
  capabilities.set(capId, cap);

  return {
    ok: true,
    capabilityId: capId,
    expiresAt: new Date(cap.expiresAt).toISOString(),
    bound: {
      centerId: cap.centerId,
      branchId: cap.branchId,
      source: cap.source,
      remotePath: cap.remotePath,
      localPath: cap.localPath,
      googleFileId: cap.googleFileId,
      expectedSize: cap.expectedSize,
    },
    stage: 'authorization',
    diagnosticId,
  };
}

function tryAuthorizeChannel(event, channel, opts) {
  if (!BOOTSTRAP_RESTORE_CHANNELS.has(channel)) return { ok: false };
  const capId = opts?.bootstrapRestoreCapabilityId;
  if (!capId) return { ok: false };

  purgeExpired();
  const cap = capabilities.get(String(capId));
  if (!cap || cap.consumed) {
    return { ok: false, error: 'restore_authorization_required' };
  }
  if (cap.webContentsId !== event?.sender?.id) {
    return { ok: false, error: 'restore_authorization_required' };
  }
  if (Date.now() > cap.expiresAt) {
    capabilities.delete(cap.id);
    return { ok: false, error: 'restore_authorization_required' };
  }

  const remotePath = normalizePath(opts?.remotePath);
  const googleFileId = String(opts?.googleFileId || opts?.fileId || '').trim();
  const localPathRaw = String(opts?.localPath || opts?.filePath || '').trim();
  const localPath = localPathRaw ? path.resolve(localPathRaw) : null;
  if (cap.localPath) {
    if (!localPath || path.resolve(cap.localPath) !== localPath) {
      return { ok: false, error: 'restore_scope_mismatch' };
    }
  }
  if (googleFileId && cap.googleFileId && googleFileId !== cap.googleFileId) {
    return { ok: false, error: 'restore_scope_mismatch' };
  }
  if (remotePath && cap.remotePath && remotePath !== cap.remotePath) {
    return { ok: false, error: 'restore_scope_mismatch' };
  }
  const reqCenter = String(opts?.centerId || '').trim();
  if (reqCenter && reqCenter !== cap.centerId) {
    return { ok: false, error: 'restore_scope_mismatch' };
  }
  const reqBranch = String(opts?.branchId || '').trim();
  if (reqBranch && cap.branchId && reqBranch !== cap.branchId) {
    return { ok: false, error: 'restore_scope_mismatch' };
  }

  return { ok: true, capabilityId: cap.id, capability: cap, consumeOnComplete: true, bootstrap: true };
}

function consumeCapability(capabilityId) {
  const cap = capabilities.get(String(capabilityId));
  if (!cap) return { ok: false };
  cap.consumed = true;
  capabilities.delete(cap.id);
  return { ok: true };
}

function assertManifestScope(cap, manifest, scopeTruth) {
  if (!cap) return { ok: true };
  const mCenter = String(manifest?.centerId || scopeTruth?.centerId || '').trim();
  if (mCenter && mCenter !== cap.centerId) {
    return { ok: false, error: 'restore_scope_mismatch' };
  }
  const included = scopeTruth?.includedBranchIds || manifest?.includedBranchIds || [];
  if (cap.branchId && Array.isArray(included) && included.length && !included.includes(cap.branchId)) {
    return { ok: false, error: 'restore_scope_mismatch' };
  }
  return { ok: true };
}

function getCapability(capabilityId) {
  purgeExpired();
  return capabilities.get(String(capabilityId)) || null;
}

module.exports = {
  CAPABILITY_TTL_MS,
  BOOTSTRAP_RESTORE_CHANNELS,
  BOOTSTRAP_ERROR_ALIASES,
  mapBootstrapError,
  configure,
  issueRestoreCapability,
  tryAuthorizeChannel,
  consumeCapability,
  assertManifestScope,
  getCapability,
  normalizePath,
  isApprovedLocalBackupPath,
  isBootstrapPhase,
  _capabilities: capabilities,
  _purgeExpired: purgeExpired,
};
