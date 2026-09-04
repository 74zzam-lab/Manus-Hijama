/**
 * V2-5.10 — Canonical Drive path resolver (thin facade over DriveLayout + legacy candidates).
 */
(function (global) {
  'use strict';

  function dl() {
    return global.DriveLayout || {};
  }

  function centerId(fallback) {
    return fallback
      || global.ConfigLayer?.getCenterId?.()
      || global.CloudMeta?.loadMeta?.()?.centerId
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || global.CenterId?.getStoredCenterId?.()
      || '';
  }

  function branchId(fallback) {
    return fallback
      || global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || 'BR-MAIN';
  }

  function allCenterRoots(cid) {
    const D = dl();
    const id = centerId(cid);
    const roots = D.centerRootCandidates?.(id) || [];
    const legacy = [
      D.legacyCenterRoot?.(id),
      D.legacyCenterFolder?.(global.settings?.centerName),
      `NajjarTech/${id}`,
    ].filter(Boolean);
    return [...new Set([...roots, ...legacy])];
  }

  function operationalFileCandidates(cid, bid, table) {
    const D = dl();
    const id = centerId(cid);
    const b = branchId(bid);
    return D.operationalBranchFileCandidates?.(id, b, table) || [];
  }

  function configFileCandidates(cid, bid, name) {
    const D = dl();
    const id = centerId(cid);
    const b = branchId(bid);
    return D.configBranchFileCandidates?.(id, b, name) || [];
  }

  function licenseJsonCandidates(cid) {
    return dl().licenseJsonCandidates?.(centerId(cid)) || [];
  }

  function syncVersionsCandidates(cid, bid) {
    const D = dl();
    const id = centerId(cid);
    const b = branchId(bid);
    return D.syncVersionsJsonCandidates?.(id, b) || [];
  }

  function quarantineDir(cid, bid) {
    const D = dl();
    return D.quarantineDir?.(centerId(cid), branchId(bid)) || '';
  }

  function attachmentPath(cid, bid, sha256) {
    const D = dl();
    return D.attachmentBlobPath?.(centerId(cid), branchId(bid), sha256) || '';
  }

  function resolvePrimaryOperational(cid, bid, table) {
    const cands = operationalFileCandidates(cid, bid, table);
    return cands[0] || '';
  }

  global.DrivePathResolver = {
    centerId,
    branchId,
    allCenterRoots,
    operationalFileCandidates,
    configFileCandidates,
    licenseJsonCandidates,
    syncVersionsCandidates,
    quarantineDir,
    attachmentPath,
    resolvePrimaryOperational,
  };
})(typeof window !== 'undefined' ? window : globalThis);
