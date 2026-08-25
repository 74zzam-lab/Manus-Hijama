/**
 * license.json — cloud license document build / verify / local cache.
 */
(function (global) {
  'use strict';

  const LOCAL_LICENSE_KEY = '__tdw_cloud_license__';
  const REMOTE_REPLICATION_KEY = '__tdw_license_remote_replication__';

  async function signLicenseBody(body) {
    const CL = global.CommercialLicense;
    if (CL?.crypto?.hmacSha256Hex && CL.crypto.canonicalJson) {
      return CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
    }
    return null;
  }

  async function verifyLicenseDoc(doc) {
    if (!doc?.signature) return { ok: false, error: 'signature_missing' };
    const { signature, ...body } = doc;
    const expected = await signLicenseBody(body);
    if (!expected || signature !== expected) return { ok: false, error: 'signature_invalid' };
    return { ok: true };
  }

  function defaultBranches(count, centerName) {
    const n = Math.max(1, Math.min(15, Number(count) || 1));
    if (n === 1) {
      return [{ id: 'BR-MAIN', name: centerName || 'الفرع الرئيسي', code: 'MAIN', active: true }];
    }
    const names = ['الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'الخبر', 'تبوك', 'أبها', 'الطائف', 'بريدة', 'حائل', 'نجران', 'جازان', 'عرعر', 'الجبيل'];
    const out = [];
    for (let i = 0; i < n; i++) {
      const code = 'BR' + String(i + 1).padStart(2, '0');
      out.push({ id: code, name: 'فرع ' + (names[i] || (i + 1)), code: code.replace('BR', ''), active: true });
    }
    return out;
  }

  async function buildFromRecord(record, options) {
    options = options || {};
    const centerId = global.CenterId?.ensureCenterId(record.centerId || options.centerId) || '';
    const features = options.features || record.features || [];
    const existing = options.mergeLocal ? loadLocal() : null;
    const ownerIdentity = record.ownerIdentity
      || (global.LicenseIdentity?.buildOwnerIdentityFromRecord
        ? await global.LicenseIdentity.buildOwnerIdentityFromRecord(record)
        : null)
      || existing?.ownerIdentity
      || null;
    const body = {
      schemaVersion: 2,
      centerId,
      centerName: record.customer?.company || record.customer?.name || options.centerName || global.settings?.centerName || '',
      licenseId: record.licenseId,
      licenseUuid: record.licenseUuid,
      packageId: record.packageId,
      subscriptionId: record.subscriptionId,
      expiresAt: record.expiryDate,
      features: Array.isArray(features) ? features : [],
      ownerIdentity,
      limits: {
        maxDevices: 0,
        maxBranches: record.branches ?? 1,
        maxUsers: record.maxUsers ?? 10
      },
      branches: Array.isArray(options.branches)
        ? options.branches
        : (existing?.centerId === centerId && Array.isArray(existing.branches) ? existing.branches : []),
      activation: existing?.centerId === centerId && existing?.activation
        ? existing.activation
        : { consumed: false, primaryDeviceFingerprint: null, primaryDeviceUuid: null },
      devices: { registered: existing?.devices?.registered || record.devicesRegistered || [] },
      licenseVersion: Number(existing?.licenseVersion || record.licenseVersion) || 1,
      issuedAt: record.issueDate || new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString()
    };
    const signature = await signLicenseBody(body);
    return { ...body, signature };
  }

  function saveLocal(doc) {
    global.DB?.set?.(LOCAL_LICENSE_KEY, doc);
    if (doc?.centerId && global.CloudMeta) {
      const meta = global.CloudMeta.loadMeta();
      meta.centerId = doc.centerId;
      global.CloudMeta.saveMeta(meta);
    }
    try {
      global.DeviceCache?.syncLicenseToMainCache?.(doc)?.catch?.(() => {});
    } catch { /* non-fatal */ }
    return doc;
  }

  function loadLocal() {
    return global.DB?.get?.(LOCAL_LICENSE_KEY, null);
  }

  function getRemoteReplicationStatus() {
    return global.DB?.get?.(REMOTE_REPLICATION_KEY, null);
  }

  function setRemoteReplicationStatus(status) {
    const value = { ...(status || {}), updatedAt: new Date().toISOString() };
    global.DB?.set?.(REMOTE_REPLICATION_KEY, value);
    return value;
  }

  function clearRemoteReplicationStatus() {
    try { global.DB?.remove?.(REMOTE_REPLICATION_KEY); } catch { global.DB?.set?.(REMOTE_REPLICATION_KEY, null); }
  }

  function drivePath(centerId) {
    return global.DriveLayout?.licenseJson?.(centerId) || '';
  }

  function canSign() {
    const CL = global.CommercialLicense;
    return !!(CL?.crypto?.hmacSha256Hex && CL.crypto.canonicalJson);
  }

  async function resignDoc(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    if (!canSign()) return doc;
    const CL = global.CommercialLicense;
    const { signature, ...body } = doc;
    body.updatedAt = body.updatedAt || new Date().toISOString();
    const sig = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
    return { ...body, signature: sig };
  }

  async function pushToDrive(doc, options) {
    options = options || {};
    doc = doc || loadLocal();
    if (!options.skipOwnerGate) {
      const gate = global.OwnerTrustedAuthority?.assertOwnerOrBootstrap?.({
        action: 'pushToDrive',
        centerId: doc?.centerId,
        doc,
      });
      if (gate && !gate.ok) return gate;
    }
    if (!doc?.centerId) return { ok: false, error: 'no_center_id' };

    if (typeof global.DriveAdapter?.ensureConnected === 'function') {
      try { await global.DriveAdapter.ensureConnected(); } catch { /* empty */ }
    }
    if (!global.DriveAdapter?.isConnected?.()) {
      const pending = setRemoteReplicationStatus({
        state: 'pending',
        centerId: doc.centerId,
        licenseId: doc.licenseId || null,
        path: drivePath(doc.centerId) || null,
        error: 'drive_not_connected',
        offline: true,
        candidateUpdatedAt: doc.updatedAt || null
      });
      return {
        ok: false,
        offline: true,
        error: 'drive_not_connected',
        remotePublished: false,
        pendingRemote: true,
        replication: pending
      };
    }

    const path = drivePath(doc.centerId);
    if (!path) return { ok: false, error: 'no_path' };

    // Stamp updatedAt only when we can re-sign — unsigned stamp breaks remote verify/pull.
    // Save locally before upload (PR38 order) so activation survives offline/RBAC hiccups.
    let toUpload = { ...doc };
    if (canSign()) {
      toUpload = await resignDoc({ ...toUpload, updatedAt: new Date().toISOString() });
    }
    saveLocal(toUpload);

    const upload = await global.DriveAdapter.uploadJson(path, toUpload, { overwrite: true });
    if (upload && upload.ok === false) {
      const pending = setRemoteReplicationStatus({
        state: 'pending',
        centerId: toUpload.centerId,
        licenseId: toUpload.licenseId || null,
        path,
        error: upload.error || upload.code || 'drive_upload_failed',
        offline: !!upload.offline,
        candidateUpdatedAt: toUpload.updatedAt || null
      });
      return {
        ...upload,
        path,
        centerId: toUpload.centerId,
        signed: toUpload,
        remotePublished: false,
        pendingRemote: true,
        replication: pending
      };
    }
    clearRemoteReplicationStatus();
    return { ok: true, path, centerId: toUpload.centerId, signed: toUpload, remotePublished: true, ...(upload || {}) };
  }

  /** Ensure first branch exists then push signed license.json to Drive. */
  async function ensurePushedToDrive(options) {
    options = options || {};
    let doc = options.doc || loadLocal();
    if (!doc?.centerId) return { ok: false, error: 'no_center_id' };

    if (!Array.isArray(doc.branches) || !doc.branches.filter((b) => b && b.active !== false).length) {
      const name = doc.centerName || global.settings?.centerName || 'الفرع الرئيسي';
      doc.branches = defaultBranches(Math.max(1, Number(doc.limits?.maxBranches) || 1), name);
      if (doc.branches.length === 1) {
        doc.branches[0].name = name;
        doc.branches[0].id = doc.branches[0].id || 'BR-MAIN';
      }
      doc = await resignDoc({ ...doc, updatedAt: new Date().toISOString() });
      saveLocal(doc);
    }

    const push = await pushToDrive(doc);
    return push;
  }

  global.LicenseCloud = {
    LOCAL_LICENSE_KEY,
    REMOTE_REPLICATION_KEY,
    buildFromRecord,
    verifyLicenseDoc,
    resignDoc,
    saveLocal,
    loadLocal,
    getRemoteReplicationStatus,
    setRemoteReplicationStatus,
    clearRemoteReplicationStatus,
    drivePath,
    pushToDrive,
    ensurePushedToDrive,
    defaultBranches
  };
})(typeof window !== 'undefined' ? window : globalThis);
