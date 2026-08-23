'use strict';

/**
 * Compare-and-swap guards for sync push/manifest updates.
 * CAS mismatch is a retry signal (pull/merge/retry), not a fatal error.
 */

function evaluateCasPushGuard(options = {}) {
  const expected = Number(options.expectedRemoteRevision);
  const actual = Number(options.actualRemoteRevision);
  const baseRevision = options.baseRevision != null ? Number(options.baseRevision) : null;

  if (!Number.isFinite(expected) || expected < 0) {
    return {
      ok: false,
      blocked: true,
      code: 'baseline_revision_unknown',
      reason: 'baseline_revision_unknown',
      retry: false,
    };
  }

  if (!Number.isFinite(actual) || actual < 0) {
    return {
      ok: false,
      blocked: true,
      code: 'remote_revision_unconfirmed',
      reason: 'remote_revision_unconfirmed',
      retry: false,
    };
  }

  if (actual !== expected) {
    return {
      ok: false,
      blocked: true,
      code: 'remote_revision_mismatch',
      reason: 'remote_revision_mismatch',
      expectedRemoteRevision: expected,
      actualRemoteRevision: actual,
      retry: true,
    };
  }

  if (baseRevision != null && Number.isFinite(baseRevision) && baseRevision < actual) {
    return {
      ok: false,
      blocked: true,
      code: 'remote_revision_mismatch',
      reason: 'remote_revision_mismatch',
      expectedRemoteRevision: expected,
      actualRemoteRevision: actual,
      baseRevision,
      retry: true,
    };
  }

  return {
    ok: true,
    expectedRemoteRevision: expected,
    actualRemoteRevision: actual,
    baseRevision,
  };
}

function evaluateManifestCasGuard(options = {}) {
  const expected = Number(options.expectedManifestRevision);
  const actual = Number(options.actualManifestRevision);

  if (!Number.isFinite(expected) || expected < 0) {
    return {
      ok: false,
      blocked: true,
      code: 'manifest_revision_unknown',
      reason: 'manifest_revision_unknown',
      retry: false,
    };
  }

  if (!Number.isFinite(actual) || actual < 0) {
    return {
      ok: false,
      blocked: true,
      code: 'manifest_revision_unconfirmed',
      reason: 'manifest_revision_unconfirmed',
      retry: false,
    };
  }

  if (actual !== expected) {
    return {
      ok: false,
      blocked: true,
      code: 'manifest_revision_mismatch',
      reason: 'manifest_revision_mismatch',
      expectedManifestRevision: expected,
      actualManifestRevision: actual,
      retry: true,
    };
  }

  return { ok: true, expectedManifestRevision: expected, actualManifestRevision: actual };
}

module.exports = {
  evaluateCasPushGuard,
  evaluateManifestCasGuard,
};
