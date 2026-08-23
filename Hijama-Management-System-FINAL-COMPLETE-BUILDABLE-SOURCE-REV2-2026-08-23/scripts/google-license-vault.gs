/**
 * Google Apps Script — FREE license validation vault (no VPS).
 * Deploy: Extensions → Apps Script → Deploy as Web App (execute as: Me, access: Anyone).
 *
 * Sheet "activations" columns:
 *   A productKey          — dev: V5 key (TDWI2-CP001-...)
 *   B status              — dev: unused | auto: consumed
 *   C devCustomerName     — dev: اسم العميل عند البيع
 *   D devCompany          — dev: اسم المركز/الشركة
 *   E devPhone            — dev: جوال العميل
 *   F devNotes            — dev: ملاحظات
 *   G fingerprint         — auto
 *   H googleEmail         — auto: حساب Google الفعلي عند التفعيل
 *   I consumedAt          — auto
 *   J deviceUuid          — auto
 *   K deviceReference     — auto / dev اختياري
 *   L centerId            — auto بعد التفعيل
 *   M licenseId           — auto
 *   N packageLabel        — auto
 *
 * Sheet "bundles" columns:
 *   A productKey          — نفس المفتاح
 *   B bundleJson          — JSON كامل من برنامج المطوّر (≈3KB)
 *
 * POST JSON:
 *   { "action": "fetchBundle", "productKey": "TDWI2-..." }
 *   { "action": "activate", "productKey": "...", "fingerprint": "...", "deviceUuid": "...", "googleEmail": "...", "deviceReference": "...", "licenseId": "L000002", "packageLabel": "Custom" }
 *   { "action": "patchActivation", "productKey": "...", "centerId": "NJR-..." }
 *   { "action": "status", "productKey": "..." }
 */
function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === 'status') return json(status_(body));
    if (body.action === 'fetchBundle') return json(fetchBundle_(body));
    if (body.action === 'activate') return json(activate_(body));
    if (body.action === 'patchActivation') return json(patchActivation_(body));
    return json({ ok: false, error: 'unknown_action' });
  } finally {
    lock.releaseLock();
  }
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('VAULT_SHEET_ID');
  return SpreadsheetApp.openById(id);
}

function activationsSheet_() {
  const ss = spreadsheet_();
  return ss.getSheetByName('activations') || ss.getSheets()[0];
}

function bundlesSheet_() {
  const ss = spreadsheet_();
  return ss.getSheetByName('bundles');
}

function normalizeRef_(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function lookupRef_(body) {
  const key = normalizeRef_(body.productKey);
  if (key) return key;
  return normalizeRef_(body.licenseId);
}

function rowFor_(lookupRef, sheet) {
  sheet = sheet || activationsSheet_();
  const data = sheet.getDataRange().getValues();
  const want = normalizeRef_(lookupRef);
  if (!want) return null;
  for (let i = 1; i < data.length; i++) {
    if (normalizeRef_(data[i][0]) === want) return { row: i + 1, vals: data[i] };
  }
  return null;
}

function bundleRowFor_(lookupRef) {
  const sh = bundlesSheet_();
  if (!sh) return null;
  return rowFor_(lookupRef, sh);
}

function parseBundleJson_(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return null;
  }
}

function fetchBundle_(body) {
  const r = bundleRowFor_(lookupRef_(body));
  if (!r) return { ok: false, error: 'bundle_not_found' };
  const bundle = parseBundleJson_(r.vals[1]);
  if (!bundle) return { ok: false, error: 'bundle_invalid' };
  return { ok: true, bundle: bundle };
}

function status_(body) {
  const r = rowFor_(lookupRef_(body));
  if (!r) return { ok: false, error: 'not_found' };
  const v = r.vals;
  return {
    ok: true,
    status: v[1],
    devCustomerName: v[2] || '',
    devCompany: v[3] || '',
    devPhone: v[4] || '',
    fingerprint: v[6] || '',
    googleEmail: v[7] || '',
    consumedAt: v[8] || '',
    deviceUuid: v[9] || '',
    deviceReference: v[10] || '',
    centerId: v[11] || '',
    licenseId: v[12] || '',
    packageLabel: v[13] || ''
  };
}

function activate_(body) {
  const r = rowFor_(lookupRef_(body));
  if (!r) return { ok: false, error: 'not_found' };
  const v = r.vals;
  const status = String(v[1] || '').toLowerCase();
  if (status === 'consumed' || status === 'used') {
    const same = (v[6] && v[6] === body.fingerprint) || (v[9] && v[9] === body.deviceUuid);
    if (same) {
      const bundleResp = fetchBundle_(body);
      return {
        ok: true,
        recovery: true,
        status: status || 'used',
        bundle: bundleResp.ok ? bundleResp.bundle : null
      };
    }
    return { ok: false, error: 'activation_already_used' };
  }

  const sh = activationsSheet_();
  sh.getRange(r.row, 2, 1, 13).setValues([[
    'used',
    v[2] || '',
    v[3] || '',
    v[4] || '',
    v[5] || '',
    body.fingerprint || '',
    body.googleEmail || '',
    new Date().toISOString(),
    body.deviceUuid || '',
    body.deviceReference || '',
    body.centerId || '',
    body.licenseId || '',
    body.packageLabel || ''
  ]]);

  const bundleResp = fetchBundle_(body);
  return {
    ok: true,
    status: 'used',
    first: true,
    bundle: bundleResp.ok ? bundleResp.bundle : null,
    bundleMissing: !bundleResp.ok
  };
}

function patchActivation_(body) {
  const r = rowFor_(lookupRef_(body));
  if (!r) return { ok: false, error: 'not_found' };
  const sh = activationsSheet_();
  if (body.centerId) sh.getRange(r.row, 12).setValue(body.centerId);
  if (body.licenseId) sh.getRange(r.row, 13).setValue(body.licenseId);
  if (body.packageLabel) sh.getRange(r.row, 14).setValue(body.packageLabel);
  return { ok: true, patched: true };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE-TIME SETUP — run from Apps Script (Extensions → Apps Script) while the
// vault spreadsheet is open. Order: setupVaultAll() → Deploy Web App.
// ═══════════════════════════════════════════════════════════════════════════

var ACTIVATIONS_HEADERS_ = [
  'productKey', 'status', 'devCustomerName', 'devCompany', 'devPhone', 'devNotes',
  'fingerprint', 'googleEmail', 'consumedAt', 'deviceUuid', 'deviceReference',
  'centerId', 'licenseId', 'packageLabel'
];

var BUNDLES_HEADERS_ = ['productKey', 'bundleJson'];

/**
 * Links this Google Spreadsheet to the script (stores VAULT_SHEET_ID).
 * Run once with the vault spreadsheet open (bound script), OR paste ID below.
 */
function setupVaultSheetId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var id = ss ? ss.getId() : '';
  // Optional: paste Spreadsheet ID here if the script is not bound to the sheet:
  // id = 'YOUR_SPREADSHEET_ID_FROM_URL';
  if (!id) {
    throw new Error('Open the vault spreadsheet, then run setupVaultSheetId() again.');
  }
  PropertiesService.getScriptProperties().setProperty('VAULT_SHEET_ID', id);
  return {
    ok: true,
    spreadsheetId: id,
    url: ss ? ss.getUrl() : ('https://docs.google.com/spreadsheets/d/' + id + '/edit')
  };
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  var first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var empty = first.every(function (c) { return c === '' || c == null; });
  if (empty || first[0] !== headers[0]) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

/**
 * Creates/updates tabs activations + bundles with header row (row 1).
 * Import optional CSV templates from scripts/vault-templates/ in the repo.
 */
function setupVaultSheetHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('VAULT_SHEET_ID');
    if (!id) throw new Error('Run setupVaultSheetId() first or open the spreadsheet.');
    ss = SpreadsheetApp.openById(id);
  }
  ensureSheet_(ss, 'activations', ACTIVATIONS_HEADERS_);
  ensureSheet_(ss, 'bundles', BUNDLES_HEADERS_);
  return { ok: true, sheets: ['activations', 'bundles'], columns: { activations: ACTIVATIONS_HEADERS_.length, bundles: BUNDLES_HEADERS_.length } };
}

/** Full one-time setup: link sheet ID + create header rows. */
function setupVaultAll() {
  var link = setupVaultSheetId();
  var headers = setupVaultSheetHeaders();
  return {
    ok: true,
    spreadsheetId: link.spreadsheetId,
    url: link.url,
    sheets: headers.sheets,
    nextStep: 'Deploy → New deployment → Web app (Execute as: Me, Access: Anyone) → copy URL into developer License Vault settings'
  };
}

/** Quick test after Deploy — replace with a real productKey from your sheet. */
function testVaultStatus() {
  var key = 'TDWI2-CP001-REPLACE-ME';
  return status_({ productKey: key });
}
