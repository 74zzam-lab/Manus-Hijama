/**
 * Branch enrollment — atomic create with pending/rollback (V2-5.9).
 *
 * Validate → reserve id → remote metadata → verify → update registry (revision)
 * → local state → sync checkpoints → optional bind → Branch Mode only when complete.
 */
(function (global) {
  'use strict';

  const PENDING_KEY = '__tdw_branch_creation_pending__';

  function getEnrolledBranches(doc) {
    return (doc?.branches || []).filter(b => b && b.active !== false && !b.pending);
  }

  function nextBranchId(enrolled) {
    if (!enrolled.length) return 'BR-MAIN';
    let n = 1;
    const used = new Set(enrolled.map(b => b.id));
    while (n <= 99) {
      const id = n === 1 && !used.has('BR-MAIN') ? 'BR-MAIN' : 'BR' + String(n).padStart(2, '0');
      if (!used.has(id)) return id;
      n++;
    }
    return 'BR' + String(enrolled.length + 1).padStart(2, '0');
  }

  function canEnrollBranch(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    const max = global.LicenseLimits?.getMaxBranches?.(doc) || 1;
    const count = getEnrolledBranches(doc).length;
    if (count >= max) return { ok: false, error: 'branch_limit_reached', max, current: count };
    return { ok: true, max, current: count, remaining: max - count };
  }

  function loadPending() {
    try { return global.DB?.get?.(PENDING_KEY, null) || null; } catch { return null; }
  }

  function savePending(state) {
    try { global.DB?.set?.(PENDING_KEY, state); } catch { /* empty */ }
    return state;
  }

  function clearPending() {
    try { global.DB?.set?.(PENDING_KEY, null); } catch { /* empty */ }
  }

  async function signDoc(doc) {
    const CL = global.CommercialLicense;
    if (global.LicenseCloud?.verifyLicenseDoc && CL?.crypto?.hmacSha256Hex && CL.crypto.canonicalJson) {
      const { signature, ...body } = doc;
      body.updatedAt = new Date().toISOString();
      const sig = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
      return { ...body, signature: sig };
    }
    return doc;
  }

  /**
   * Compare-and-swap style license bump: reject if baseVersion mismatches current.
   */
  async function commitLicenseRevision(doc, baseVersion) {
    const fresh = global.LicenseCloud?.loadLocal?.() || doc;
    const currentVer = Number(fresh.licenseVersion) || 0;
    if (baseVersion != null && currentVer !== Number(baseVersion)) {
      return { ok: false, error: 'license_revision_conflict', expected: baseVersion, current: currentVer };
    }
    const next = { ...doc, licenseVersion: currentVer + 1 };
    const signed = await signDoc(next);
    global.LicenseCloud?.saveLocal?.(signed);
    let remoteOk = false;
    let remoteError = null;
    if (global.LicenseCloud?.pushToDrive) {
      try {
        const push = await global.LicenseCloud.pushToDrive(signed);
        remoteOk = push?.ok !== false;
        if (push?.ok === false) remoteError = push.error || push.message || 'push_failed';
      } catch (e) {
        remoteOk = false;
        remoteError = String(e?.message || e);
      }
    } else {
      remoteOk = true; // offline/local-only environments
    }
    return { ok: true, doc: signed, remoteOk, remoteError };
  }

  async function enrollBranch(doc, options) {
    options = options || {};
    doc = doc || global.LicenseCloud?.loadLocal?.();
    if (!doc?.centerId) return { ok: false, error: 'no_center_id' };

    if (options.source !== 'owner_hub' && options.source !== 'activation_wizard') {
      return { ok: false, error: 'owner_hub_required' };
    }

    if (options.source === 'owner_hub') {
      const ownerGate = global.OwnerTrustedAuthority?.assertOwnerMutation?.({
        action: 'enrollBranch',
        branchId: options.branchId,
      });
      if (ownerGate && !ownerGate.ok) return ownerGate;
    } else {
      const bootGate = global.OwnerTrustedAuthority?.assertOwnerOrBootstrap?.({
        action: 'enrollBranch_activation',
      });
      if (bootGate && !bootGate.ok) return bootGate;
    }

    // Block double-submit while another creation is pending.
    const existingPending = loadPending();
    if (existingPending && existingPending.status === 'BRANCH_CREATION_PENDING' && !options.resumePending) {
      if (existingPending.idempotencyKey && options.idempotencyKey
        && String(existingPending.idempotencyKey) === String(options.idempotencyKey)) {
        return { ok: false, error: 'branch_creation_in_progress', pending: existingPending };
      }
      if (!options.forceNew) {
        return { ok: false, error: 'branch_creation_in_progress', pending: existingPending };
      }
    }

    const enrolled = getEnrolledBranches(doc);
    if (options.source === 'activation_wizard' && enrolled.length > 0) {
      return { ok: false, error: 'activation_wizard_first_branch_only', current: enrolled.length };
    }
    if (options.idempotencyKey) {
      const prev = global.DB?.get?.('__tdw_branch_idempotency__', {}) || {};
      const hit = prev[String(options.idempotencyKey)];
      if (hit?.branchId && enrolled.some((b) => b.id === hit.branchId)) {
        return { ok: true, already: true, branch: enrolled.find((b) => b.id === hit.branchId), doc };
      }
    }
    const gate = canEnrollBranch(doc);
    if (!gate.ok) return gate;

    const branchName = String(options.branchName || '').trim();
    if (!branchName) return { ok: false, error: 'branch_name_required' };

    const branchId = options.branchId || nextBranchId(enrolled);
    if (enrolled.some(b => b.id === branchId)) {
      return { ok: false, error: 'branch_id_exists', branchId };
    }

    const baseVersion = Number(doc.licenseVersion) || 0;
    const branch = {
      id: branchId,
      name: branchName,
      code: options.branchCode || (branchId === 'BR-MAIN' ? 'MAIN' : branchId.replace(/^BR-?/, '')),
      active: true,
      pending: true,
      configSource: options.configSource || 'org_defaults', // org_defaults | copy_branch | empty
      copyFromBranchId: options.copyFromBranchId || null,
      enrolledAt: new Date().toISOString(),
      enrolledByDevice: options.deviceUuid || global.DeviceConfig?.load?.()?.deviceUuid || null
    };

    const pending = savePending({
      status: 'BRANCH_CREATION_PENDING',
      branchId,
      branchName,
      baseVersion,
      idempotencyKey: options.idempotencyKey || null,
      startedAt: new Date().toISOString(),
      configSource: branch.configSource,
    });

    // Stage local pending branch (not operational-ready).
    const staged = {
      ...doc,
      branches: enrolled.concat(branch),
    };

    const committed = await commitLicenseRevision(staged, baseVersion);
    if (!committed.ok) {
      clearPending();
      return committed;
    }

    if (!committed.remoteOk && options.requireRemote !== false && global.DriveAdapter?.isConnected?.()) {
      // Keep pending — do not open operational writes on half-created branch.
      savePending({
        ...pending,
        status: 'BRANCH_CREATION_PENDING',
        remoteError: committed.remoteError,
        docVersion: committed.doc.licenseVersion,
        updatedAt: new Date().toISOString(),
      });
      return {
        ok: false,
        error: 'BRANCH_CREATION_PENDING',
        pending: true,
        branch,
        doc: committed.doc,
        remoteError: committed.remoteError,
        message: 'الفرع محجوز محلياً بانتظار تأكيد السحابة — لا تفتح العمل التشغيلي عليه بعد',
      };
    }

    // Finalize: clear pending flag on branch.
    const finalizedBranches = (committed.doc.branches || []).map((b) => {
      if (b && b.id === branchId) {
        const { pending: _p, ...rest } = b;
        return { ...rest, active: true, finalizedAt: new Date().toISOString() };
      }
      return b;
    });
    let finalDoc = { ...committed.doc, branches: finalizedBranches };
    finalDoc = await signDoc({ ...finalDoc, licenseVersion: (Number(finalDoc.licenseVersion) || 0) + 1 });
    global.LicenseCloud?.saveLocal?.(finalDoc);
    if (global.LicenseCloud?.pushToDrive) {
      await global.LicenseCloud.pushToDrive(finalDoc).catch(() => {});
    }

    if (options.idempotencyKey) {
      try {
        const prev = global.DB?.get?.('__tdw_branch_idempotency__', {}) || {};
        prev[String(options.idempotencyKey)] = { branchId, at: new Date().toISOString() };
        global.DB?.set?.('__tdw_branch_idempotency__', prev);
      } catch { /* empty */ }
    }

    // Init empty sync checkpoint for branch (no operational clone).
    try {
      global.SyncState?.initBranchCheckpoint?.(branchId);
    } catch { /* empty */ }

    clearPending();

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'BRANCH_ENROLLED',
        entity: 'branch',
        entityId: branchId,
        summary: `Branch enrolled atomically: ${branchName} (${branchId})`
      });
    }

    const finalBranch = finalizedBranches.find((b) => b.id === branchId);
    return {
      ok: true,
      branch: finalBranch,
      doc: finalDoc,
      created: true,
      atomic: true,
      configSource: branch.configSource,
    };
  }

  global.BranchEnrollment = {
    PENDING_KEY,
    getEnrolledBranches,
    nextBranchId,
    canEnrollBranch,
    enrollBranch,
    loadPending,
    clearPending,
    commitLicenseRevision,
  };
})(typeof window !== 'undefined' ? window : globalThis);
