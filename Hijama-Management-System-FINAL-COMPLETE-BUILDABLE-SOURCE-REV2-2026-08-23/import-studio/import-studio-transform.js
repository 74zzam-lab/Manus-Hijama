/* Import Studio — Column mapping, transforms & auto-detection */

function importStudioAllAliases() {
  const aliases = {};
  if (typeof IMPORT_COLUMN_ALIASES !== 'undefined') {
    Object.assign(aliases, IMPORT_COLUMN_ALIASES);
  }
  const extra = typeof IMPORT_STUDIO_EXTRA_FIELDS !== 'undefined' ? IMPORT_STUDIO_EXTRA_FIELDS : {};
  Object.entries(extra).forEach(([k, def]) => {
    aliases[k] = def.aliases || [];
  });
  return aliases;
}

function importStudioAutoDetectColumns(headers, fieldDefs) {
  const mapping = {};
  const used = new Set();
  const aliases = importStudioAllAliases();
  Object.keys(fieldDefs).forEach(field => {
    let bestIdx = -1;
    let bestScore = 0;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const score = typeof scoreColumnMatch === 'function'
        ? scoreColumnMatch(h, field)
        : importStudioScoreColumn(h, aliases[field] || []);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    if (bestIdx >= 0 && bestScore >= 40) {
      mapping[field] = { action: 'map', target: field, colIdx: bestIdx };
      used.add(bestIdx);
    }
  });
  return mapping;
}

function importStudioScoreColumn(header, aliases) {
  const h = String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!h) return 0;
  let best = 0;
  (aliases || []).forEach(alias => {
    const a = alias.toLowerCase();
    if (h === a) best = Math.max(best, 100);
    else if (h.includes(a) || a.includes(h)) best = Math.max(best, 75);
  });
  return best;
}

function importStudioBuildDefaultColumnRules(file, fieldDefs) {
  const rules = {};
  const auto = importStudioAutoDetectColumns(file.headers || [], fieldDefs);
  Object.entries(auto).forEach(([field, r]) => {
    rules[`col_${r.colIdx}`] = { action: 'map', target: field, colIdx: r.colIdx };
  });
  (file.headers || []).forEach((h, i) => {
    const key = `col_${i}`;
    if (!rules[key]) rules[key] = { action: 'ignore', colIdx: i, header: h };
  });
  return rules;
}

function importStudioReadRawRow(raw, headers) {
  if (Array.isArray(raw)) {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = raw[i] != null ? raw[i] : ''; });
    return obj;
  }
  return raw || {};
}

function importStudioApplyColumnRules(rawRow, headers, rules, defaults) {
  const row = importStudioReadRawRow(rawRow, headers);
  const rec = {};
  Object.values(rules || {}).forEach(rule => {
    if (!rule || rule.action === 'ignore') return;
    if (rule.action === 'constant') {
      if (rule.target) rec[rule.target] = rule.value ?? '';
      return;
    }
    if (rule.action === 'merge' && rule.mergeCols?.length) {
      const parts = rule.mergeCols.map(i => {
        const h = headers[i];
        return h != null ? String(row[h] ?? '').trim() : '';
      }).filter(Boolean);
      const sep = rule.separator ?? ' ';
      if (rule.target) rec[rule.target] = parts.join(sep);
      return;
    }
    if (rule.action === 'calculated' && rule.formula === 'fullName') {
      const first = rule.firstCol != null ? String(row[headers[rule.firstCol]] ?? '').trim() : '';
      const last = rule.lastCol != null ? String(row[headers[rule.lastCol]] ?? '').trim() : '';
      if (rule.target) rec[rule.target] = [first, last].filter(Boolean).join(' ');
      return;
    }
    if (rule.action === 'map' && rule.target != null && rule.colIdx != null) {
      const h = headers[rule.colIdx];
      rec[rule.target] = h != null ? row[h] : '';
    }
  });
  Object.entries(defaults || {}).forEach(([field, val]) => {
    if (rec[field] == null || String(rec[field]).trim() === '') rec[field] = val;
  });
  return rec;
}

function importStudioRecordsFromFile(file, rules, defaults, fieldDefs, modes) {
  const headers = file.headers || [];
  const rows = file.rawRows || file.rows || [];
  return rows.map((raw, i) => {
    let rec = importStudioApplyColumnRules(raw, headers, rules, defaults);
    rec = importStudioCleanRecord(rec, fieldDefs, modes);
    const valid = importStudioValidateRecord(rec, fieldDefs, modes);
    return { index: i, raw, record: rec, valid: valid.ok, errors: valid.errors || [] };
  });
}

function importStudioLegacyMappingFromRules(rules) {
  const mapping = {};
  Object.values(rules || {}).forEach(r => {
    if (r?.action === 'map' && r.target && r.colIdx != null) mapping[r.target] = r.colIdx;
  });
  return mapping;
}

function importStudioFilterRows(rows, filters) {
  if (!filters?.length) return rows;
  return rows.filter(item => {
    const rec = item.record || item;
    return filters.every(f => {
      const v = rec[f.field];
      const val = String(v ?? '').toLowerCase();
      const cmp = String(f.value ?? '').toLowerCase();
      switch (f.op) {
        case 'eq': return val === cmp;
        case 'neq': return val !== cmp;
        case 'gt': return parseFloat(v) > parseFloat(f.value);
        case 'gte': return parseFloat(v) >= parseFloat(f.value);
        case 'contains': return val.includes(cmp);
        default: return true;
      }
    });
  });
}
