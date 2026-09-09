/**
 * V2-5.6 — Backup history normalize / sort / restore-point selection.
 */
(function (global) {
  'use strict';

  const VALIDATIONS = Object.freeze(['unknown', 'valid', 'invalid']);

  function asIso(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return new Date(v).toISOString();
    }
    const s = String(v);
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    return s;
  }

  function normalizeValidation(v) {
    const s = String(v == null ? 'unknown' : v).toLowerCase();
    if (s === 'ok' || s === 'pass' || s === 'passed' || s === 'true') return 'valid';
    if (s === 'fail' || s === 'failed' || s === 'bad' || s === 'false') return 'invalid';
    if (VALIDATIONS.includes(s)) return s;
    return 'unknown';
  }

  function normalizeEntry(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const path = String(raw.path || raw.filePath || raw.file || '');
    const id = String(raw.id || raw.backupId || path || raw.name || '');
    const createdAt = asIso(raw.createdAt || raw.mtime || raw.timestamp || raw.date) || null;
    let size = Number(raw.size != null ? raw.size : raw.bytes);
    if (!Number.isFinite(size)) size = 0;
    const validation = normalizeValidation(
      raw.validation != null
        ? raw.validation
        : (raw.valid === true ? 'valid' : raw.valid === false ? 'invalid' : 'unknown')
    );
    const label = String(
      raw.label ||
      raw.name ||
      (path ? path.split(/[/\\]/).pop() : '') ||
      id ||
      'backup'
    );
    return {
      id,
      path,
      createdAt,
      modifiedAt: asIso(raw.modifiedAt) || createdAt,
      size,
      validation,
      label,
      source: raw.source || 'local',
      remotePath: raw.remotePath || (raw.source === 'cloud' ? path : ''),
      scopeType: raw.scopeType || raw.classification || null,
      scopeLabelAr: raw.scopeLabelAr || null,
      includedBranchIds: Array.isArray(raw.includedBranchIds) ? raw.includedBranchIds : [],
    };
  }

  function sortByNewest(list) {
    const arr = Array.isArray(list) ? list.slice() : [];
    arr.sort((a, b) => {
      const ta = Date.parse((a && a.createdAt) || '') || 0;
      const tb = Date.parse((b && b.createdAt) || '') || 0;
      if (tb !== ta) return tb - ta;
      return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
    });
    return arr;
  }

  function selectRestorePoint(list, id) {
    const target = String(id == null ? '' : id);
    if (!target) return null;
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      const entry = normalizeEntry(arr[i]);
      if (entry.id === target || entry.path === target) return entry;
    }
    return null;
  }

  const api = {
    VALIDATIONS,
    normalizeEntry,
    sortByNewest,
    selectRestorePoint
  };

  global.BackupHistory = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
