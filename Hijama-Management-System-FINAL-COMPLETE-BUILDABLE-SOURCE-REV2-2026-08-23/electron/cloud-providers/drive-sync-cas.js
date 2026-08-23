/**
 * Google Drive sync CAS orchestration.
 *
 * Contract (do not mix levels):
 *   - casResource=manifest  → expectedBranchRevision vs versions.json databaseVersion
 *   - casResource=table     → expectedTableRevision vs table JSON revision
 *
 * Server atomicity: Drive v2 If-Match precondition (etag from v2 metadata / response header).
 * Drive v3 JSON does NOT expose etag — never request fields=etag on v3.
 *
 * Status until live Drive UAT: implementation present, Google Drive CAS = UNVERIFIED.
 */
const crypto = require('crypto');

const CAS_RESOURCE = {
  MANIFEST: 'manifest',
  TABLE: 'table',
};

function normalizePayloadBuffer(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8');
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function inferCasResource(remotePath, meta = {}) {
  if (meta.casResource) return meta.casResource;
  const name = String(remotePath || '').split('/').pop() || '';
  if (/^versions\.json$/i.test(name)) return CAS_RESOURCE.MANIFEST;
  return CAS_RESOURCE.TABLE;
}

function parseBranchRevision(text, branchId) {
  try {
    const doc = JSON.parse(String(text || '{}'));
    if (branchId && doc?.branches?.[branchId]?.databaseVersion != null) {
      return Number(doc.branches[branchId].databaseVersion);
    }
    return Number(doc?.databaseVersion ?? 0);
  } catch {
    return null;
  }
}

function parseTableRevision(text) {
  try {
    const doc = JSON.parse(String(text || '{}'));
    if (doc?.revision == null) return 0;
    return Number(doc.revision);
  } catch {
    return null;
  }
}

function parseRemoteRevision(text, meta) {
  const kind = inferCasResource(meta.remotePath, meta);
  if (kind === CAS_RESOURCE.MANIFEST) {
    return parseBranchRevision(text, meta.branchId);
  }
  return parseTableRevision(text);
}

function resolveExpectedRevision(meta) {
  const kind = inferCasResource(meta.remotePath, meta);
  if (kind === CAS_RESOURCE.MANIFEST) {
    if (meta.expectedBranchRevision != null) return Number(meta.expectedBranchRevision);
    if (meta.expectedDatabaseVersion != null) return Number(meta.expectedDatabaseVersion);
    return null;
  }
  if (meta.expectedTableRevision != null) return Number(meta.expectedTableRevision);
  return null;
}

function revisionMismatch(expected, actual, message, code) {
  return {
    ok: false,
    code: code || 'remote_revision_mismatch',
    message: message || code || 'remote_revision_mismatch',
    retry: true,
    expectedRevision: expected,
    actualRevision: actual,
    casResource: message,
  };
}

function mapDriveError(err) {
  if (err?.code === 'remote_revision_mismatch' || err?.status === 412) {
    return {
      ok: false,
      code: 'remote_revision_mismatch',
      message: err.message || 'remote_revision_mismatch',
      retry: true,
      preconditionSource: err.preconditionSource || null,
    };
  }
  return {
    ok: false,
    message: err?.message || String(err),
    needsReauth: !!err?.needsReauth,
    code: err?.code || undefined,
  };
}

function missingPreconditionToken() {
  return {
    ok: false,
    code: 'remote_precondition_unavailable',
    message: 'remote_precondition_unavailable',
    retry: false,
    casVerified: false,
  };
}

/**
 * @param {object} deps
 * @param {object} oauth2
 * @param {string} remotePath
 * @param {Buffer|string|object} payload
 * @param {object} meta
 */
async function conditionalReplaceJson(deps, oauth2, remotePath, payload, meta = {}) {
  const data = normalizePayloadBuffer(payload);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const casResource = inferCasResource(remotePath, meta);
  const expectedRev = resolveExpectedRevision({ ...meta, remotePath });
  const mimeType = 'application/json';
  const useV2 = typeof deps.getFilePreconditionV2 === 'function'
    && typeof deps.updateFileMediaWithIfMatchV2 === 'function';

  try {
    const existing = await deps.findFileByPath(oauth2, remotePath, { includeDuplicates: true });
    const canonical = existing?.canonical || existing;

    if (canonical?.id) {
      const dl = await deps.downloadByPath(oauth2, remotePath, { fileId: canonical.id });
      if (!dl?.buffer && !dl?.text) {
        return { ok: false, message: 'remote_read_failed' };
      }
      const remoteText = dl.text || String(dl.buffer || '');
      const actualRev = parseRemoteRevision(remoteText, { ...meta, remotePath, casResource });

      if (expectedRev != null && !Number.isFinite(expectedRev)) {
        return { ok: false, code: 'baseline_revision_unknown', message: 'baseline_revision_unknown' };
      }
      if (expectedRev != null && actualRev != null && actualRev !== expectedRev) {
        const code = casResource === CAS_RESOURCE.MANIFEST
          ? 'manifest_revision_mismatch'
          : 'remote_revision_mismatch';
        return revisionMismatch(expectedRev, actualRev, casResource, code);
      }
      if (expectedRev != null && actualRev == null) {
        return { ok: false, code: 'remote_revision_unconfirmed', message: 'remote_revision_unconfirmed' };
      }

      if (!useV2) {
        return missingPreconditionToken();
      }

      const pre = await deps.getFilePreconditionV2(oauth2, canonical.id);
      const ifMatch = pre?.etag || pre?.responseEtag;
      if (!ifMatch) {
        return missingPreconditionToken();
      }

      const updated = await deps.updateFileMediaWithIfMatchV2(
        oauth2,
        canonical.id,
        { title: canonical.name || canonical.title },
        mimeType,
        data,
        { ifMatch, preconditionSource: 'drive_v2_etag' }
      );

      if (existing?.duplicates?.length && deps.trashDuplicates) {
        await deps.trashDuplicates(oauth2, existing.duplicates);
      }

      return {
        ok: true,
        id: updated.id,
        path: remotePath,
        sha256: hash,
        md5: updated.md5Checksum,
        etag: updated.etag || updated.responseEtag || null,
        atomic: true,
        cas: true,
        casResource,
        casVerified: false,
        preconditionSource: 'drive_v2_etag',
        provider: meta.provider || 'google',
      };
    }

    if (expectedRev != null && expectedRev !== 0) {
      const code = casResource === CAS_RESOURCE.MANIFEST
        ? 'manifest_revision_mismatch'
        : 'remote_revision_mismatch';
      return revisionMismatch(expectedRev, 0, casResource, code);
    }

    const parts = String(remotePath || '').split('/').filter(Boolean);
    const fileName = parts.pop();
    const parentId = await deps.resolveFolderPath(oauth2, parts, { create: true });

    if (!useV2 || !deps.insertFileWithIfNoneMatchV2) {
      return missingPreconditionToken();
    }

    const created = await deps.insertFileWithIfNoneMatchV2(
      oauth2,
      {
        title: fileName,
        mimeType,
        parents: parentId ? [{ id: parentId }] : undefined,
      },
      mimeType,
      data,
      { ifNoneMatch: '*', preconditionSource: 'drive_v2_if_none_match' }
    );

    return {
      ok: true,
      id: created.id,
      path: remotePath,
      sha256: hash,
      md5: created.md5Checksum,
      etag: created.etag || created.responseEtag || null,
      atomic: true,
      cas: true,
      casResource,
      casVerified: false,
      created: true,
      preconditionSource: 'drive_v2_if_none_match',
      provider: meta.provider || 'google',
    };
  } catch (err) {
    return mapDriveError(err);
  }
}

module.exports = {
  CAS_RESOURCE,
  conditionalReplaceJson,
  normalizePayloadBuffer,
  inferCasResource,
  parseBranchRevision,
  parseTableRevision,
  parseRemoteRevision,
  resolveExpectedRevision,
  revisionMismatch,
  mapDriveError,
  missingPreconditionToken,
};
