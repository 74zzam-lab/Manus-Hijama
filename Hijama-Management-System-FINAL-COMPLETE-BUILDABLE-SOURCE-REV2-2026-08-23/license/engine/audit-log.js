(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const AUDIT_KEY = 'commercial_license_audit_v2';

  function loadAudit() {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* empty */ }
    return {
      schemaVersion: 1,
      registryVersion: '1.2.0',
      entries: []
    };
  }

  function saveAudit(audit) {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(audit));
    const day = new Date().toISOString().slice(0, 10);
    localStorage.setItem(AUDIT_KEY + '.snapshot.' + day, JSON.stringify(audit));
  }

  function nextAuditId(audit) {
    const n = (audit.entries.length + 1);
    return 'aud-' + String(n).padStart(6, '0');
  }

  function log(action, target, details, actor) {
    const audit = loadAudit();
    audit.entries.push({
      id: nextAuditId(audit),
      ts: new Date().toISOString(),
      actor: actor || 'activation_admin',
      action,
      target: target || '',
      details: details || {},
      ip: null
    });
    saveAudit(audit);
    return audit.entries[audit.entries.length - 1];
  }

  CL.auditLog = { loadAudit, saveAudit, log };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
