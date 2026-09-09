/* Import Studio — Simplified UI (4 stages) */

function importStudioEnsureModal() {
  if (document.getElementById('importStudioModal')) return;
  const css = document.createElement('style');
  css.textContent = `
    #importStudioModal .studio-steps{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}
    #importStudioModal .studio-step-dot{font-size:12px;padding:6px 12px;border-radius:20px;background:var(--surface);border:1px solid var(--border);color:var(--text-muted)}
    #importStudioModal .studio-step-dot.active{background:var(--primary);color:#fff;border-color:var(--primary)}
    #importStudioModal .studio-step-dot.done{background:rgba(59,130,246,.12);color:var(--primary)}
    #importStudioModal .studio-preview-row{display:grid;grid-template-columns:36px 1fr 90px 90px 1fr;gap:6px;padding:5px 8px;border-radius:6px;font-size:12px;align-items:center}
    #importStudioModal .studio-preview-row.st-new{background:rgba(34,197,94,.1)}
    #importStudioModal .studio-preview-row.st-update{background:rgba(234,179,8,.1)}
    #importStudioModal .studio-preview-row.st-merge{background:rgba(59,130,246,.1)}
    #importStudioModal .studio-preview-row.st-error{background:rgba(239,68,68,.1)}
    #importStudioModal .studio-preview-row.st-skipped{background:rgba(148,163,184,.12)}
    #importStudioModal .studio-file-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin:4px;font-size:12px}
    #importStudioModal .studio-map-grid .form-label{font-size:13px;margin-bottom:4px}
    #importStudioModal .studio-map-status{font-size:13px;line-height:2;padding:10px 12px;background:var(--surface);border-radius:8px;border:1px solid var(--border);margin-top:12px}
  `;
  document.head.appendChild(css);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'importStudioModal';
  overlay.innerHTML = `
    <div class="modal" style="max-width:720px;max-height:92vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title">📥 استيراد Excel</div>
        <button class="modal-close" type="button" onclick="closeImportStudio()">✕</button>
      </div>
      <div class="studio-steps" id="import-studio-steps"></div>
      <div id="import-studio-body"></div>
      <div class="divider"></div>
      <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" type="button" onclick="importStudioBack()">→ السابق</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" type="button" onclick="closeImportStudio()">إلغاء</button>
          <button class="btn btn-primary" id="import-studio-next-btn" type="button" onclick="importStudioNext()">التالي ←</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function openImportStudio() {
  if (typeof hasPermission === 'function' && !hasPermission('clients.edit')) {
    notify('⛔ ليس لديك صلاحية استيراد البيانات', 'danger');
    return;
  }
  importStudioEnsureModal();
  _importStudio = importStudioDefaultState();
  document.getElementById('importStudioModal').classList.add('open');
  importStudioRender();
}

function closeImportStudio() {
  document.getElementById('importStudioModal')?.classList.remove('open');
  _importStudio = null;
}

function importStudioRender() {
  const st = _importStudio;
  if (!st) return;
  document.getElementById('import-studio-steps').innerHTML = IMPORT_STUDIO_STAGES.map(s =>
    `<span class="studio-step-dot ${s.id === st.step ? 'active' : ''} ${s.id < st.step ? 'done' : ''}">${s.id}. ${s.label}</span>`
  ).join('');
  const body = document.getElementById('import-studio-body');
  const fns = [importStudioRenderFiles, importStudioRenderMapping, importStudioRenderPreview, importStudioRenderReport];
  body.innerHTML = fns[st.step - 1](st);
  const btn = document.getElementById('import-studio-next-btn');
  if (btn) {
    btn.textContent = st.step === 3 ? 'استيراد ←' : st.step === 4 ? '—' : 'التالي ←';
    btn.style.display = st.step >= 4 ? 'none' : '';
    btn.disabled = !!st.executing;
  }
}

function importStudioRenderFiles(st) {
  const chips = (st.files || []).map(f =>
    `<span class="studio-file-chip">📄 ${f.name} (${f.rowCount} صف)
      <button type="button" class="btn btn-ghost btn-sm" style="padding:0 4px" onclick="importStudioRemoveFile('${f.id}')">✕</button></span>`
  ).join('');
  return `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Excel أو CSV — ملف واحد أو أكثر (مثال: عملاء + زيارات).</p>
    <label class="btn btn-primary" style="cursor:pointer;display:inline-flex;gap:8px;margin-bottom:10px">
      📂 اختيار ملفات
      <input type="file" accept=".xlsx,.xls,.csv" multiple style="display:none" onchange="importStudioOnFilesSelected(this)">
    </label>
    <div>${chips || '<span style="color:var(--text-muted);font-size:13px">لم يُرفع ملف بعد</span>'}</div>
    ${(st.files || []).length > 1 ? `
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;font-weight:600">
        <input type="checkbox" ${st.join?.enabled ? 'checked' : ''} onchange="_importStudio.join.enabled=this.checked;importStudioRender()">
        ربط الملفات (حسب رقم الملف / الجوال / الهوية)
      </label>` : ''}`;
}

function importStudioGetFieldColIdx(rules, field) {
  const hit = Object.values(rules || {}).find(r => r?.action === 'map' && r.target === field);
  return hit?.colIdx != null ? hit.colIdx : -1;
}

function importStudioSetFieldMap(fileId, field, colIdxStr) {
  if (!_importStudio) return;
  const rules = _importStudio.columnRules[fileId] || {};
  Object.keys(rules).forEach(k => {
    if (rules[k]?.target === field) {
      const i = rules[k].colIdx;
      rules[k] = { action: 'ignore', colIdx: i, header: k };
    }
  });
  if (colIdxStr !== '' && colIdxStr != null) {
    const idx = parseInt(colIdxStr, 10);
    Object.keys(rules).forEach(k => {
      if (rules[k]?.colIdx === idx && rules[k]?.target !== field) {
        rules[k] = { action: 'ignore', colIdx: idx };
      }
    });
    rules[`col_${idx}`] = { action: 'map', target: field, colIdx: idx };
  }
  _importStudio.columnRules[fileId] = rules;
}

function importStudioSetDefault(fileId, field, val) {
  if (!_importStudio || !field) return;
  if (!_importStudio.defaults) _importStudio.defaults = {};
  if (!_importStudio.defaults[fileId]) _importStudio.defaults[fileId] = {};
  _importStudio.defaults[fileId][field] = val;
}

function importStudioRenderMapping(st) {
  const file = st.files?.[0];
  if (!file) return '<p>ارفع ملفاً أولاً</p>';
  const fieldDefs = importStudioGetActiveFieldDefs();
  if (!st.columnRules[file.id]) {
    st.columnRules[file.id] = importStudioBuildDefaultColumnRules(file, fieldDefs);
  }
  const rules = st.columnRules[file.id];
  const mode = importStudioResolveLegacyModeFromMapping(st.columnRules, file.id);
  const modeLbl = mode === 'full' ? 'عملاء + زيارات' : 'عملاء فقط (سجل العملاء)';
  const fieldCards = Object.entries(fieldDefs).map(([key, def]) => {
    const colIdx = importStudioGetFieldColIdx(rules, key);
    const selOpts = ['<option value="">— تجاهل —</option>']
      .concat((file.headers || []).map((h, i) =>
        `<option value="${i}" ${colIdx === i ? 'selected' : ''}>${h || 'عمود ' + (i + 1)}</option>`
      )).join('');
    const defVal = st.defaults?.[file.id]?.[key] ?? '';
    return `
      <div class="form-group" style="margin:0">
        <label class="form-label">${def.label}${def.required ? ' <span class="req">*</span>' : ''}</label>
        <select class="form-control import-map-select" onchange="importStudioSetFieldMap('${file.id}','${key}',this.value)">${selOpts}</select>
        <input class="form-control" style="margin-top:6px;font-size:12px" placeholder="قيمة افتراضية (اختياري)"
          value="${String(defVal).replace(/"/g, '&quot;')}"
          onchange="importStudioSetDefault('${file.id}','${key}',this.value)">
      </div>`;
  }).join('');
  const statusLine = Object.entries(fieldDefs).map(([k, def]) => {
    const ok = importStudioGetFieldColIdx(rules, k) >= 0;
    return `${def.label} ${ok ? '✓' : (def.required ? '✗' : '—')}`;
  }).join(' &nbsp;|&nbsp; ');
  return `
    <p style="font-size:13px;font-weight:700;margin-bottom:6px">🤖 ربط الأعمدة — ${file.name}</p>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:6px">تم التعرف تلقائياً — يمكنك تعديل الربط أو ترك الحقل = تجاهل</p>
    <div style="font-size:13px;margin-bottom:12px;padding:8px 10px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">
      <strong>الوضع:</strong> ${modeLbl}
    </div>
    <div class="form-grid form-grid-2 studio-map-grid" style="gap:12px">${fieldCards}</div>
    <div class="studio-map-status">${statusLine}</div>
    ${(st.files || []).length > 1 ? `<p style="font-size:12px;color:var(--text-muted);margin-top:10px">📎 ملفات إضافية: ${st.files.slice(1).map(f => f.name).join('، ')} — تُدمج عند تفعيل الربط</p>` : ''}`;
}

function importStudioSetColumnMap(fileId, colIdx, target) {
  importStudioSetFieldMap(fileId, target, target ? String(colIdx) : '');
}

function importStudioRenderPreview(st) {
  st.simulation = importStudioSimulate(st);
  const s = st.simulation;
  const prior = st.files?.[0]?.hash && typeof findPriorFileImport === 'function'
    ? findPriorFileImport(st.files[0].hash) : null;
  const strategies = typeof IMPORT_DUPLICATE_STRATEGIES !== 'undefined' ? IMPORT_DUPLICATE_STRATEGIES : {
    skip: { label: 'تجاهل المكرر', desc: 'تخطّي الموجود والمكرر في الملف' },
    update: { label: 'تحديث البيانات', desc: 'دمج الأعمدة المربوطة — لا يمسح الموجود' },
    replace: { label: 'استبدال', desc: 'استبدال من الملف' },
    import_all: { label: 'استيراد الكل', desc: 'كل الصفوف حتى المكرر' }
  };
  const stratHtml = Object.entries(strategies).map(([k, def]) =>
    `<label class="card-type-option" style="display:flex;gap:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer">
      <input type="radio" name="studio-dup-strategy" value="${k}" ${(st.duplicateStrategy || 'skip') === k ? 'checked' : ''}
        onchange="_importStudio.duplicateStrategy=this.value;importStudioRender()" style="margin-top:3px">
      <span><strong>${def.label}</strong><br><span style="font-size:11px;color:var(--text-muted)">${def.desc}</span></span>
    </label>`
  ).join('');
  const fpHtml = IMPORT_STUDIO_VISIT_FINGERPRINT.map(f => {
    const on = (st.visitFingerprint || []).includes(f.key);
    return `<label class="tag ${on ? 'tag-blue' : 'tag-gray'}" style="cursor:pointer;padding:4px 8px;font-size:11px">
      <input type="checkbox" ${on ? 'checked' : ''} style="margin-left:4px" onchange="importStudioToggleFingerprint('${f.key}',this.checked)">${f.label}
    </label>`;
  }).join('');
  const statusLbl = { new: 'جديد', update: 'تحديث', merge: 'دمج', error: 'خطأ', skipped: 'تجاهل' };
  const preview = (s.preview || []).slice(0, 15).map(p =>
    `<div class="studio-preview-row st-${p.status}">
      <span>${p.i}</span><span>${p.name}</span><span>${p.phone}</span>
      <span>${statusLbl[p.status] || p.status}</span><span style="color:var(--text-muted);font-size:11px">${p.reason || ''}</span>
    </div>`
  ).join('');
  return `
    ${prior ? `<div style="padding:10px;margin-bottom:12px;background:rgba(255,193,7,.1);border:1px solid rgba(255,193,7,.4);border-radius:8px;font-size:13px">
      ⚠️ <strong>تم استيراد هذا الملف مسبقاً</strong> — آخر مرة: ${prior.imported || 0} جديد، ${prior.updated || 0} تحديث. اختر الاستراتيجية المناسبة.
    </div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:12px;font-size:12px;text-align:center">
      <div class="tag tag-blue" style="padding:6px">الكل<br><b>${s.total}</b></div>
      <div class="tag tag-green" style="padding:6px">جديد<br><b>${s.new}</b></div>
      <div class="tag tag-gold" style="padding:6px">تحديث<br><b>${s.update}</b></div>
      <div class="tag tag-blue" style="padding:6px">دمج<br><b>${s.merge}</b></div>
      <div class="tag tag-red" style="padding:6px">خطأ<br><b>${s.error}</b></div>
      <div class="tag tag-gray" style="padding:6px">تجاهل<br><b>${s.skipped}</b></div>
    </div>
    <div style="font-size:13px;font-weight:700;margin-bottom:6px">استراتيجية الاستيراد</div>
    ${stratHtml}
    ${s.legacyMode === 'full' ? `<div style="margin-top:10px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">تمييز الزيارة المكررة</div><div style="display:flex;flex-wrap:wrap;gap:6px">${fpHtml}</div></div>` : ''}
    <div style="max-height:180px;overflow-y:auto;margin-top:12px;border:1px solid var(--border);border-radius:8px">${preview}</div>`;
}

function importStudioRenderReport(st) {
  const r = st.result;
  if (!r) return '';
  if (r.error) return `<div class="tag tag-red" style="padding:12px;display:block">${r.error}</div>`;
  return `
    <div style="font-size:16px;font-weight:800;margin-bottom:10px">✅ اكتمل الاستيراد</div>
    <div style="line-height:2;font-size:14px">
      <div>فُحص: <strong>${r.scanned}</strong> · جديد: <strong style="color:var(--success)">${r.imported}</strong> · تحديث: <strong>${r.updated}</strong> · تجاهل: <strong>${r.skipped}</strong></div>
      <div>المدة: ${r.duration} ث</div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-accent btn-sm" type="button" onclick="importStudioDownloadReport(_importStudio.result)">📥 تقرير</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="importStudioUndoLast()">↩️ تراجع</button>
      <button class="btn btn-primary btn-sm" type="button" onclick="closeImportStudio();refreshClientsView();refreshDailyTable();refreshDashboard();">إغلاق</button>
    </div>`;
}

function importStudioToggleFingerprint(key, on) {
  if (!_importStudio) return;
  const s = new Set(_importStudio.visitFingerprint || []);
  if (on) s.add(key); else s.delete(key);
  _importStudio.visitFingerprint = [...s];
}

function importStudioRemoveFile(id) {
  if (!_importStudio) return;
  _importStudio.files = (_importStudio.files || []).filter(f => f.id !== id);
  importStudioRender();
}

async function importStudioOnFilesSelected(input) {
  if (!input.files?.length || !_importStudio) return;
  for (const file of input.files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { notify('⚠️ ' + file.name + ': صيغة غير مدعومة', 'danger'); continue; }
    try {
      const matrix = await parseImportWorkbook(file);
      const parsed = rowsToImportData(matrix);
      const hash = await hashImportFile(JSON.stringify(matrix.slice(0, 500)));
      _importStudio.files.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 4),
        name: file.name, headers: parsed.headers, rawRows: parsed.rows,
        rowCount: parsed.rows.length, hash
      });
    } catch (e) { notify('⚠️ ' + file.name, 'danger'); }
  }
  input.value = '';
  importStudioRender();
}

function importStudioBack() {
  if (!_importStudio || _importStudio.step <= 1 || _importStudio.executing) return;
  _importStudio.step--;
  importStudioRender();
}

async function importStudioNext() {
  const st = _importStudio;
  if (!st || st.executing) return;
  if (!importStudioCanProceed(st)) { notify('⚠️ أكمل المتطلبات (الاسم + الجوال على الأقل)', 'danger'); return; }
  if (st.step === 3) {
    st.executing = true;
    importStudioRender();
    try {
      st.result = await importStudioExecute(st);
      if (typeof logAudit === 'function') {
        logAudit('SETTINGS_CHANGED', `استيراد Excel: ${st.result.imported} — ${(st.files || []).map(f => f.name).join(', ')}`, {});
      }
    } catch (e) { st.result = { error: e.message, scanned: 0, imported: 0, updated: 0, skipped: 0 }; }
    st.executing = false;
    st.step = 4;
    importStudioRender();
    return;
  }
  if (st.step < 4) { st.step++; importStudioRender(); }
}
