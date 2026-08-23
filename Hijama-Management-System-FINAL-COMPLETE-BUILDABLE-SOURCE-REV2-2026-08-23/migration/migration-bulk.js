/**
 * Bulk apply — branch, doctor, tags, notes on import batch.
 */
(function (global) {
  'use strict';

  function readBulkOptionsFromDom() {
    return {
      branch: document.getElementById('import-bulk-branch')?.value?.trim() || '',
      doctorId: document.getElementById('import-bulk-doctor')?.value || '',
      service: document.getElementById('import-bulk-service')?.value?.trim() || '',
      source: document.getElementById('import-bulk-source')?.value?.trim() || '',
      tags: document.getElementById('import-bulk-tags')?.value?.trim() || '',
      notes: document.getElementById('import-bulk-notes')?.value?.trim() || '',
      applyTo: document.getElementById('import-bulk-apply')?.value || 'all'
    };
  }

  function shouldApplyBulk(bulk, rowKind) {
    if (!bulk) return false;
    if (bulk.applyTo === 'all') return true;
    if (bulk.applyTo === 'new' && rowKind === 'new') return true;
    if (bulk.applyTo === 'updated' && (rowKind === 'updated' || rowKind === 'merged')) return true;
    return false;
  }

  function applyBulkToClient(client, bulk, doctors) {
    if (!client || !bulk) return client;
    if (bulk.branch) client.branch = bulk.branch;
    if (bulk.source) client.source = bulk.source;
    if (bulk.tags) {
      const tags = bulk.tags.split(/[,،;|]/).map(t => t.trim()).filter(Boolean);
      client.tags = [...new Set([...(client.tags || []), ...tags])];
    }
    if (bulk.notes) {
      client.importNote = bulk.notes;
      if (!client.fileProfile) client.fileProfile = {};
      if (!client.fileProfile.purpose) client.fileProfile.purpose = bulk.notes;
    }
    return client;
  }

  function applyBulkToCase(caseRec, bulk, doctors) {
    if (!caseRec || !bulk) return caseRec;
    if (bulk.doctorId && doctors) {
      const doc = doctors.find(d => d.id === bulk.doctorId);
      if (doc) { caseRec.doctorId = doc.id; caseRec.doctorName = doc.name; }
    }
    if (bulk.service && !caseRec.serviceType) caseRec.serviceType = bulk.service;
    if (bulk.notes && (!caseRec.notes || caseRec.notes === 'مستورد من Excel')) {
      caseRec.notes = bulk.notes;
    }
    return caseRec;
  }

  function injectBulkOptionsUI(container, doctors) {
    if (!container || document.getElementById('import-bulk-panel')) return;
    const docOpts = (doctors || []).filter(d => d.active !== false).map(d =>
      `<option value="${d.id}">${d.name}</option>`).join('');
    const panel = document.createElement('div');
    panel.id = 'import-bulk-panel';
    panel.style.cssText = 'margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)';
    panel.innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">⚙️ إعدادات جماعية (اختياري)</div>
      <div class="form-grid form-grid-2" style="gap:8px">
        <div class="form-group" style="margin:0"><label class="form-label">الفرع</label><input class="form-control" id="import-bulk-branch"></div>
        <div class="form-group" style="margin:0"><label class="form-label">الأخصائي</label><select class="form-control" id="import-bulk-doctor"><option value="">—</option>${docOpts}</select></div>
        <div class="form-group" style="margin:0"><label class="form-label">الخدمة</label><input class="form-control" id="import-bulk-service" placeholder="حجامة"></div>
        <div class="form-group" style="margin:0"><label class="form-label">مصدر العميل</label><input class="form-control" id="import-bulk-source" placeholder="استيراد"></div>
        <div class="form-group" style="margin:0"><label class="form-label">وسوم</label><input class="form-control" id="import-bulk-tags" placeholder="مستورد,2026"></div>
        <div class="form-group" style="margin:0"><label class="form-label">تطبيق على</label>
          <select class="form-control" id="import-bulk-apply">
            <option value="all">الكل</option>
            <option value="new">الجدد فقط</option>
            <option value="updated">المحدّثين فقط</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;grid-column:1/-1"><label class="form-label">ملاحظة موحدة</label><input class="form-control" id="import-bulk-notes"></div>
      </div>`;
    container.appendChild(panel);
  }

  global.MigrationBulk = {
    readBulkOptionsFromDom, shouldApplyBulk, applyBulkToClient, applyBulkToCase, injectBulkOptionsUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
