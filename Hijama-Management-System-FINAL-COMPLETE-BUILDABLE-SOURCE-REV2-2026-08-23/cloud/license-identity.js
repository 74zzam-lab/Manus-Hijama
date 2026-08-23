/**
 * License owner identity — binds Cloud V2 to one Google account.
 * Pre-set email from developer (optional). Customer may change from primary device + new Google login.
 */
(function (global) {
  'use strict';

  const PENDING_CHANGE_KEY = '__tdw_pending_identity_change__';

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getConnectedGoogleEmail() {
    // Identity decisions must use the same main-authoritative snapshot as the
    // BootFlow gate; renderer cache alone cannot bind a commercial license.
    const snapshot = global.DriveAdapter?.authoritySnapshot?.();
    if (snapshot?.verified && snapshot?.connected && !snapshot?.needsReauth && !snapshot?.stale) {
      return normalizeEmail(snapshot.email || '');
    }
    return '';
  }

  function getOwnerIdentity(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    return doc.ownerIdentity || {};
  }

  function getBoundGoogleEmail(doc) {
    return normalizeEmail(getOwnerIdentity(doc).boundGoogleEmail || '');
  }

  function getAuthorizedEmail(doc) {
    return normalizeEmail(getOwnerIdentity(doc).authorizedEmail || '');
  }

  async function digestEmail(email) {
    const CL = global.CommercialLicense;
    const norm = normalizeEmail(email);
    if (!norm || !CL?.crypto?.hmacSha256Hex) return '';
    return (await CL.crypto.hmacSha256Hex('OWNER-ID|' + norm)).slice(0, 32);
  }

  async function buildOwnerIdentityFromRecord(record) {
    const authorizedEmail = normalizeEmail(record?.customer?.email || record?.ownerEmail || '');
    return {
      authorizedEmail: authorizedEmail || null,
      authorizedEmailDigest: authorizedEmail ? await digestEmail(authorizedEmail) : null,
      boundGoogleEmail: null,
      boundAt: null,
      identityRevision: 0,
      lastChangedAt: null
    };
  }

  async function verifyGoogleBinding(options) {
    options = options || {};
    const doc = global.LicenseCloud?.loadLocal?.();
    if (!doc?.centerId) return { ok: true, skipped: true, reason: 'no_cloud_license' };

    const connected = getConnectedGoogleEmail();
    if (!connected) {
      return options.allowOffline
        ? { ok: true, skipped: true, reason: 'google_not_connected' }
        : { ok: false, error: 'google_not_connected' };
    }

    const bound = getBoundGoogleEmail(doc);
    const authorized = getAuthorizedEmail(doc);

    if (!bound) {
      if (authorized && connected !== authorized) {
        return { ok: false, error: 'google_email_mismatch', expected: authorized, actual: connected };
      }
      return { ok: true, needsBind: true, email: connected };
    }

    if (connected !== bound) {
      return {
        ok: false,
        error: 'google_identity_transfer',
        expected: bound,
        actual: connected
      };
    }

    return { ok: true, email: connected };
  }

  async function resignDoc(doc) {
    const CL = global.CommercialLicense;
    if (!CL?.crypto?.hmacSha256Hex || !CL.crypto.canonicalJson) return doc;
    const { signature, ...body } = doc;
    body.updatedAt = new Date().toISOString();
    const sig = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
    return { ...body, signature: sig };
  }

  async function saveDoc(doc, push) {
    doc = await resignDoc(doc);
    global.LicenseCloud?.saveLocal?.(doc);
    if (push !== false && global.LicenseCloud?.pushToDrive) {
      await global.LicenseCloud.pushToDrive(doc).catch(() => {});
    }
    return doc;
  }

  async function bindGoogleAccount(email, options) {
    options = options || {};
    email = normalizeEmail(email);
    if (!email) return { ok: false, error: 'google_not_connected' };

    let doc = global.LicenseCloud?.loadLocal?.();
    if (!doc?.centerId) return { ok: true, skipped: true, reason: 'no_cloud_license' };

    const identity = { ...(doc.ownerIdentity || {}) };
    const bound = normalizeEmail(identity.boundGoogleEmail);
    const authorized = normalizeEmail(identity.authorizedEmail);

    if (bound && bound === email) return { ok: true, already: true, email };

    if (bound && bound !== email) {
      const pending = global.sessionStorage?.getItem?.(PENDING_CHANGE_KEY);
      if (pending || options.allowIdentityChange) {
        identity.boundGoogleEmail = email;
        identity.boundEmailDigest = await digestEmail(email);
        identity.identityRevision = (Number(identity.identityRevision) || 0) + 1;
        identity.lastChangedAt = new Date().toISOString();
        global.sessionStorage?.removeItem?.(PENDING_CHANGE_KEY);
        doc.ownerIdentity = identity;
        await saveDoc(doc, true);
        if (typeof global.AuditLogger?.log === 'function') {
          global.AuditLogger.log({
            action: 'OWNER_IDENTITY_CHANGED',
            entity: 'license',
            entityId: doc.licenseId || doc.centerId,
            summary: `Google identity changed to ${email}`
          });
        }
        return { ok: true, changed: true, email };
      }
      return { ok: false, error: 'google_identity_transfer', expected: bound, actual: email };
    }

    if (authorized && email !== authorized && !options.skipAuthorizedCheck) {
      return { ok: false, error: 'google_email_mismatch', expected: authorized, actual: email };
    }

    identity.boundGoogleEmail = email;
    identity.boundEmailDigest = await digestEmail(email);
    identity.boundAt = new Date().toISOString();
    if (!identity.authorizedEmail && !options.skipAuthorizedCheck) {
      identity.authorizedEmail = email;
      identity.authorizedEmailDigest = identity.boundEmailDigest;
    }
    doc.ownerIdentity = identity;
    await saveDoc(doc, true);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'OWNER_GOOGLE_BOUND',
        entity: 'license',
        entityId: doc.licenseId || doc.centerId,
        summary: `Google account bound: ${email}`
      });
    }

    return { ok: true, bound: true, email };
  }

  function beginIdentityChange() {
    try {
      global.sessionStorage?.setItem?.(PENDING_CHANGE_KEY, '1');
      return { ok: true };
    } catch {
      return { ok: false, error: 'storage_unavailable' };
    }
  }

  function cancelIdentityChange() {
    try { global.sessionStorage?.removeItem?.(PENDING_CHANGE_KEY); } catch { /* empty */ }
  }

  async function onGoogleConnected(email) {
    const verify = await verifyGoogleBinding({ allowOffline: true });
    if (!verify.ok) return verify;
    if (verify.needsBind || verify.skipped) {
      return bindGoogleAccount(email);
    }
    if (getBoundGoogleEmail() && normalizeEmail(email) !== getBoundGoogleEmail()) {
      return bindGoogleAccount(email);
    }
    return { ok: true, email: normalizeEmail(email) };
  }

  function formatIdentityStatus(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    const id = getOwnerIdentity(doc);
    const bound = getBoundGoogleEmail(doc);
    const authorized = getAuthorizedEmail(doc);
    const connected = getConnectedGoogleEmail();
    let state = 'unbound';
    if (bound && connected === bound) state = 'ok';
    else if (bound && connected && connected !== bound) state = 'mismatch';
    else if (bound) state = 'bound_offline';
    return {
      state,
      authorizedEmail: authorized || id.authorizedEmail || '',
      boundGoogleEmail: bound,
      connectedGoogleEmail: connected,
      identityRevision: id.identityRevision || 0
    };
  }

  global.LicenseIdentity = {
    normalizeEmail,
    getConnectedGoogleEmail,
    getOwnerIdentity,
    getBoundGoogleEmail,
    getAuthorizedEmail,
    digestEmail,
    buildOwnerIdentityFromRecord,
    verifyGoogleBinding,
    bindGoogleAccount,
    onGoogleConnected,
    beginIdentityChange,
    cancelIdentityChange,
    formatIdentityStatus,
    PENDING_CHANGE_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
