/* Import Studio — Core (simplified: fields the program actually uses) */

const IMPORT_STUDIO_STAGES = [
  { id: 1, key: 'files', label: 'الملفات' },
  { id: 2, key: 'map', label: 'الربط' },
  { id: 3, key: 'preview', label: 'المعاينة' },
  { id: 4, key: 'report', label: 'النتيجة' }
];

const IMPORT_STUDIO_JOIN_KEYS = [
  { key: 'fileNo', label: 'رقم الملف' },
  { key: 'patientId', label: 'رقم الهوية' },
  { key: 'phone', label: 'الجوال' },
  { key: 'name', label: 'الاسم' }
];

const IMPORT_STUDIO_VISIT_FINGERPRINT = [
  { key: 'date', label: 'تاريخ الزيارة', defaultOn: true },
  { key: 'doctor', label: 'الأخصائي', defaultOn: true },
  { key: 'cups', label: 'عدد الكاسات', defaultOn: true },
  { key: 'total', label: 'قيمة الفاتورة' }
];

let _importStudio = null;

function importStudioDefaultState() {
  return {
    step: 1,
    files: [],
    columnRules: {},
    defaults: {},
    join: { enabled: false, keys: ['fileNo', 'phone', 'patientId'] },
    duplicateStrategy: 'skip',
    visitFingerprint: IMPORT_STUDIO_VISIT_FINGERPRINT.filter(f => f.defaultOn).map(f => f.key),
    simulation: null,
    executing: false,
    result: null
  };
}

/** Only fields registered in the program for clients / visits */
function importStudioGetActiveFieldDefs() {
  const fields = {};
  if (typeof IMPORT_FIELDS !== 'undefined') {
    Object.entries(IMPORT_FIELDS).forEach(([k, def]) => {
      fields[k] = { ...def, key: k };
    });
  }
  return fields;
}

function importStudioResolveLegacyModeFromMapping(columnRules, fileId) {
  const rules = columnRules?.[fileId] || columnRules || {};
  const mapped = new Set(
    Object.values(rules).filter(r => r?.action === 'map' && r.target).map(r => r.target)
  );
  const visitFields = ['cups', 'date', 'total', 'cash', 'card', 'doctor', 'notes'];
  if (visitFields.some(f => mapped.has(f))) return 'full';
  return 'clients_only';
}

function importStudioCanProceed(st) {
  if (!st) return false;
  if (st.step === 1) return (st.files || []).length > 0;
  if (st.step === 2) {
    const file = st.files?.[0];
    if (!file) return false;
    const rules = st.columnRules?.[file.id] || {};
    const mapped = Object.values(rules).filter(r => r?.action === 'map').map(r => r.target);
    return mapped.includes('name') && mapped.includes('phone');
  }
  return true;
}

function importStudioBuildExecutionOptions(st) {
  const file = st.files?.[0];
  const legacyMode = importStudioResolveLegacyModeFromMapping(st.columnRules, file?.id);
  const mapping = importStudioLegacyMappingFromRules(st.columnRules?.[file?.id] || {});
  return {
    mode: legacyMode,
    duplicateStrategy: st.duplicateStrategy || 'skip',
    skipDuplicates: (st.duplicateStrategy || 'skip') === 'skip',
    mapping,
    visitFingerprint: st.visitFingerprint,
    modes: {
      mergeVisits: st.duplicateStrategy !== 'import_all',
      ignoreEmpty: st.duplicateStrategy === 'update' || st.duplicateStrategy === 'skip',
      dataCleaning: true,
      validation: true,
      undoImport: true,
      importLog: true
    }
  };
}
