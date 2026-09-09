/* Import Studio — Multi-file join & cross-file merge */

function importStudioGetJoinValue(rec, key, customCol) {
  if (!rec) return '';
  if (key === 'custom' && customCol != null) return String(rec[customCol] ?? rec[`col_${customCol}`] ?? '').trim();
  if (key === 'phone' && typeof normalizeImportPhone === 'function') return normalizeImportPhone(rec.phone || rec[key] || '');
  return String(rec[key] ?? rec[key === 'fileNo' ? 'fileNo' : key] ?? '').trim().toLowerCase();
}

function importStudioBuildJoinIndex(fileBundle, joinKeys, customKeyCol) {
  const index = new Map();
  (fileBundle || []).forEach(bundle => {
    if (bundle.role !== 'primary') return;
    (bundle.rows || []).forEach(item => {
      const rec = item.record || item;
      joinKeys.forEach(key => {
        const val = importStudioGetJoinValue(rec, key, customKeyCol?.[bundle.fileId]);
        if (!val) return;
        const mapKey = `${key}:${val}`;
        if (!index.has(mapKey)) index.set(mapKey, []);
        index.get(mapKey).push({ fileId: bundle.fileId, rec, item });
      });
    });
  });
  return index;
}

function importStudioFindLinkedRows(rec, fileBundle, joinConfig) {
  const keys = joinConfig?.keys || ['fileNo', 'phone', 'patientId'];
  const linked = [];
  (fileBundle || []).forEach(bundle => {
    if (bundle.role === 'primary') return;
    let matched = null;
    for (const key of keys) {
      const val = importStudioGetJoinValue(rec, key, joinConfig.customKeyCol?.[bundle.fileId]);
      if (!val) continue;
      const hit = (bundle.rows || []).find(item => {
        const r = item.record || item;
        return importStudioGetJoinValue(r, key, joinConfig.customKeyCol?.[bundle.fileId]) === val;
      });
      if (hit) { matched = hit; break; }
    }
    if (matched) linked.push({ fileId: bundle.fileId, type: bundle.type, row: matched });
  });
  return linked;
}

function importStudioMergeLinkedRecords(primaryRec, linkedRows) {
  const merged = { ...primaryRec };
  linkedRows.forEach(link => {
    const r = link.row?.record || link.row || {};
    Object.entries(r).forEach(([k, v]) => {
      if (v == null || String(v).trim() === '') return;
      if (merged[k] == null || String(merged[k]).trim() === '') merged[k] = v;
    });
  });
  return merged;
}

function importStudioPrepareFileBundles(st, fieldDefs) {
  const modes = st.modes || {};
  const bundles = [];
  (st.files || []).forEach((file, idx) => {
    const rules = st.columnRules?.[file.id] || importStudioBuildDefaultColumnRules(file, fieldDefs);
    if (!st.columnRules) st.columnRules = {};
    if (!st.columnRules[file.id]) st.columnRules[file.id] = rules;
    const defaults = st.defaults?.[file.id] || st.defaults || {};
    let rows = importStudioRecordsFromFile(file, rules, defaults, fieldDefs, modes);
    rows = importStudioFilterRows(rows, st.filters);
    bundles.push({
      fileId: file.id,
      fileName: file.name,
      role: idx === 0 ? 'primary' : 'linked',
      headers: file.headers,
      rows
    });
  });
  if (st.join?.enabled && bundles.length > 1) {
    bundles.forEach((bundle, idx) => {
      if (idx === 0) return;
      bundle.rows = bundle.rows.map(item => {
        const links = importStudioFindLinkedRows(item.record, bundles, st.join);
        if (!links.length) return item;
        return {
          ...item,
          record: importStudioMergeLinkedRecords(item.record, links),
          mergedFrom: links.map(l => l.fileId)
        };
      });
    });
  }
  return bundles;
}

function importStudioFlattenPrimaryRows(bundles) {
  const primary = bundles.find(b => b.role === 'primary') || bundles[0];
  if (!primary) return [];
  return primary.rows || [];
}
