/* Import Studio — Analyze, simulate & execute */

function importStudioSimulate(st) {
  const fieldDefs = importStudioGetActiveFieldDefs();
  const execOpts = importStudioBuildExecutionOptions(st);
  const legacyMode = execOpts.mode;
  const bundles = importStudioPrepareFileBundles(st, fieldDefs);
  const rows = importStudioFlattenPrimaryRows(bundles);
  const simSt = { ...st, modes: execOpts.modes, duplicateStrategy: execOpts.duplicateStrategy };
  const stats = { total: rows.length, new: 0, update: 0, merge: 0, error: 0, skipped: 0, preview: [], legacyMode };

  rows.forEach((item, i) => {
    const cls = importStudioClassifyRow(item, simSt, legacyMode);
    const key = cls.status === 'new' ? 'new' : cls.status === 'update' ? 'update'
      : cls.status === 'merge' ? 'merge' : cls.status === 'error' ? 'error' : 'skipped';
    stats[key]++;
    if (stats.preview.length < 20) {
      stats.preview.push({
        i: i + 1,
        name: item.record?.name || '—',
        phone: item.record?.phone || '—',
        status: cls.status,
        reason: cls.reason
      });
    }
  });
  return stats;
}

async function importStudioExecute(st) {
  const execOpts = importStudioBuildExecutionOptions(st);
  const fieldDefs = importStudioGetActiveFieldDefs();
  const bundles = importStudioPrepareFileBundles(st, fieldDefs);
  const rows = importStudioFlattenPrimaryRows(bundles);
  const records = rows.filter(r => r.valid).map(r => r.record);

  if (execOpts.modes?.undoImport !== false && typeof backupBeforeImport === 'function') {
    await backupBeforeImport();
  }

  const result = {
    scanned: rows.length, imported: 0, updated: 0, skipped: 0, errors: 0,
    details: [], skippedRows: [],
    files: (st.files || []).map(f => f.name),
    legacyMode: execOpts.mode,
    duplicateStrategy: execOpts.duplicateStrategy
  };

  if (typeof runClientImport === 'function') {
    const primary = st.files?.[0];
    const prevWizard = typeof _importWizard !== 'undefined' ? _importWizard : null;
    _importWizard = {
      fileName: primary?.name || 'import-studio',
      fileHash: primary?.hash || '',
      mapping: execOpts.mapping
    };
    const legacyResult = await runClientImport(records, execOpts.mode, execOpts);
    _importWizard = prevWizard;
    result.imported = legacyResult.imported || 0;
    result.updated = legacyResult.updated || 0;
    result.skipped = legacyResult.skipped || 0;
    result.details = legacyResult.details || [];
    result.skippedRows = legacyResult.skippedRows || [];
    result.reimport = legacyResult.reimport;
  } else {
    result.error = 'محرك الاستيراد غير متاح';
  }

  rows.filter(r => !r.valid).forEach(r => {
    result.errors++;
    result.skippedRows.push({ name: r.record?.name || '—', phone: r.record?.phone || '—', reason: (r.errors || []).join('، ') });
  });

  result.duration = '0.1';
  result.executedAt = new Date().toISOString();
  result.executedBy = currentUser?.fullName || 'Import';

  const log = DB.get('importStudioLog', []);
  log.unshift({ at: result.executedAt, files: result.files, stats: { imported: result.imported, updated: result.updated, skipped: result.skipped } });
  if (log.length > 100) log.length = 100;
  DB.set('importStudioLog', log);

  if (typeof trackBackupOperation === 'function') trackBackupOperation();
  return result;
}

function importStudioClassifyRow(item, st, legacyMode) {
  const rec = item.record || item;
  const modes = st.modes || {};
  const duplicateStrategy = st.duplicateStrategy || 'skip';
  if (!item.valid) return { status: 'error', reason: (item.errors || []).join('، ') };

  let existing = typeof findRegistryByPhoneName === 'function'
    ? findRegistryByPhoneName(rec.phone, rec.name) : null;

  const visitDup = legacyMode === 'full' && modes.mergeVisits !== false &&
    importStudioCaseExists(rec, st.visitFingerprint);

  if (visitDup && duplicateStrategy !== 'import_all') {
    return { status: 'skipped', reason: 'زيارة مسجلة مسبقاً' };
  }
  if (existing && duplicateStrategy === 'skip') {
    return legacyMode === 'clients_only'
      ? { status: 'skipped', reason: 'مسجل في السجل' }
      : { status: 'skipped', reason: 'عميل موجود' };
  }
  if (existing && (duplicateStrategy === 'update' || duplicateStrategy === 'replace')) {
    return { status: 'update', reason: 'تحديث بيانات' };
  }
  if (existing) return { status: 'merge', reason: 'دمج' };
  return { status: 'new', reason: 'جديد' };
}

function importStudioVisitFingerprint(rec, fingerprintKeys) {
  return (fingerprintKeys || ['date', 'doctor', 'cups']).map(k => {
    if (k === 'date' && typeof parseImportDate === 'function') return parseImportDate(rec.date) || '';
    if (k === 'phone') return typeof normalizeImportPhone === 'function' ? normalizeImportPhone(rec.phone) : rec.phone;
    return String(rec[k] ?? '').trim().toLowerCase();
  }).join('|');
}

function importStudioCaseExists(rec, fingerprintKeys) {
  const fp = importStudioVisitFingerprint(rec, fingerprintKeys);
  return (cases || []).some(c => {
    const p = typeof normalizeImportPhone === 'function' ? normalizeImportPhone(c.phone) : c.phone;
    const rp = typeof normalizeImportPhone === 'function' ? normalizeImportPhone(rec.phone) : rec.phone;
    if (p !== rp) return false;
    const existing = importStudioVisitFingerprint({
      date: c.date, doctor: c.doctorName, cups: c.cups, total: c.total
    }, fingerprintKeys);
    return existing === fp;
  });
}

async function importStudioUndoLast() {
  const snap = DB.get('preImportBackup', null);
  if (!snap?.snapshot) { notify('⚠️ لا توجد نسخة للتراجع', 'danger'); return false; }
  if (!confirm('استعادة البيانات كما قبل الاستيراد؟')) return false;
  if (typeof SyncedWrite !== 'undefined' && SyncedWrite.restoreFromBackup) {
    const res = await SyncedWrite.restoreFromBackup(snap.snapshot, { source: 'import_studio_undo' });
    if (!res?.ok) { notify('⚠️ تعذر التراجع — ' + (res?.error || ''), 'danger'); return false; }
    if (typeof refreshAfterBackupRestore === 'function') refreshAfterBackupRestore(snap.snapshot, res);
    else { refreshClientsView?.(); refreshDailyTable?.(); refreshDashboard?.(); }
    notify('✅ تم التراجع', 'success');
    return true;
  }
  notify('⚠️ محرك الاستعادة غير متاح', 'danger');
  return false;
}

function importStudioDownloadReport(result) {
  if (typeof downloadImportReport === 'function' && result.details?.length) {
    downloadImportReport({ ...result, skipDuplicates: result.duplicateStrategy === 'skip' });
    return;
  }
  if (typeof XLSX === 'undefined') { notify('⚠️ لا يمكن إنشاء التقرير', 'danger'); return; }
  const rows = [['الحالة', 'الاسم', 'الجوال', 'التفاصيل'],
    ...(result.details || []).map(d => [d.status, d.name, d.phone, d.reason])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
  XLSX.writeFile(wb, `Import_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
