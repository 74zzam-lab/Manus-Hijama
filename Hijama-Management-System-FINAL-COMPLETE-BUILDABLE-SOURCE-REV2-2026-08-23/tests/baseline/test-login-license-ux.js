#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

// ── Static presence checks ──
check(html.includes('Hard ceiling so the login UI never stays stuck'), 'licCheck hard timeout missing');
check(html.includes('Always restore a usable pre-auth screen'), 'closeLicenseScreen must restore login for guests');
check(html.includes("function withTimeout(promise, ms, label)"), 'startup withTimeout missing');
check(/await withTimeout\(licCheck\(\), \d+, 'licCheck'\)/.test(html), 'startup must timeout licCheck');
check(boot.includes('const forceLogin = !!(opts?.showLogin || !global.currentUser)'), 'BootFlow close must force login when unauthenticated');
check(html.includes('function isPreAuthDbKeyAllowed'), 'pre-auth DB allowlist helper missing');
check(html.includes("function finalizeLicCheckUi"), 'finalizeLicCheckUi missing');
check(html.includes('function assertPreAuthViewport'), 'assertPreAuthViewport missing');
check(html.includes("Hard guarantee: never end with both overlays hidden"), 'closeLicenseScreen finally-restore missing');
check(!/_DB_AUTH_EXEMPT = new Set\(\)\s*;/.test(html), '_DB_AUTH_EXEMPT must not be empty');
check(html.includes("'settings'"), 'settings must be pre-auth writable');
check(html.includes('Silent deny for automatic/pre-auth writes'), 'dbSetGuarded must not toast-spam pre-auth');
check(html.includes('window.closeLicenseScreen = closeLicenseScreen'), 'closeLicenseScreen must be on window for onclick');
check(/let expenses = DB\.get\('expenses'/.test(html), 'expenses store must be declared');
{
  const bookingsIdx = html.indexOf('let bookings = DB.get(\'bookings\'');
  const expensesDeclIdx = html.indexOf('let expenses = DB.get(\'expenses\'');
  const topSyncIdx = html.indexOf('syncAppGlobals();', bookingsIdx);
  check(bookingsIdx >= 0 && expensesDeclIdx >= 0 && topSyncIdx >= 0, 'bookings/expenses/syncAppGlobals anchors missing');
  check(expensesDeclIdx < topSyncIdx, 'expenses must be declared before top-level syncAppGlobals()');
}
check(html.includes('clearPendingLoginLicenseStatus'), 'early login license safety net missing');
check(html.includes('globalThis.__assignUsersClosure'), 'users closure must use globalThis in Electron renderer');
check(!/[^A-Za-z0-9_]global\.__assignUsersClosure/.test(html), 'must not use bare global.__assignUsersClosure');
check(html.includes('window.doLogin = doLogin'), 'doLogin must be on window for inline onclick');
check(html.includes('if (bootOpen) return true'), 'assertPreAuthViewport must preserve BootFlow overlay');

// ── Inline script syntax ──
{
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    i += 1;
    try {
      // eslint-disable-next-line no-new-func
      new Function(m[1]);
    } catch (e) {
      errors.push(`inline script #${i} syntax: ${e.message}`);
    }
  }
}

// ── DOM simulation: open → close must not blank viewport; pre-auth DB writes ──
{
  const classList = () => {
    const set = new Set();
    return {
      add: (...xs) => xs.forEach((x) => set.add(x)),
      remove: (...xs) => xs.forEach((x) => set.delete(x)),
      contains: (x) => set.has(x),
      toggle: (x, on) => {
        if (on) set.add(x);
        else set.delete(x);
        return on;
      },
      _set: set
    };
  };

  function el(id, extra) {
    const node = {
      id,
      classList: classList(),
      style: {},
      value: '',
      textContent: id === 'login-license-status' ? 'جارٍ التحقق من الترخيص...' : '',
      innerHTML: '',
      hidden: false,
      dataset: {},
      children: [],
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      closest() { return null; },
      ...extra
    };
    return node;
  }

  const login = el('loginScreen');
  const license = el('licenseScreen');
  license.classList.add('hidden');
  const status = el('login-license-status');
  const shell = el('app-shell');
  shell.classList.add('app-shell--locked');
  const byId = {
    loginScreen: login,
    licenseScreen: license,
    'login-license-status': status,
    'app-shell': shell,
    'lic-step-devlogin': el('lic-step-devlogin'),
    'lic-step-manage': el('lic-step-manage'),
    'lic-dev-user': el('lic-dev-user'),
    'lic-dev-pass': el('lic-dev-pass'),
    'lic-dev-err': el('lic-dev-err'),
    'lic-renew-err': el('lic-renew-err'),
    'lic-renew-ok': el('lic-renew-ok'),
    'lic-renew-preview': el('lic-renew-preview'),
    bootFlowOverlay: el('bootFlowOverlay'),
    centerSetupModal: el('centerSetupModal'),
    cloudConnectModal: el('cloudConnectModal'),
    devContactModal: el('devContactModal'),
    themePickerModal: el('themePickerModal'),
    commProviderModal: el('commProviderModal')
  };

  const store = new Map();
  const notifications = [];

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Date,
    JSON,
    Math,
    Error,
    document: {
      getElementById: (id) => byId[id] || null,
      querySelector: (sel) => {
        if (sel === '#loginScreen .login-box') return el('login-box');
        if (sel === '.lic-box') return el('lic-box');
        if (sel === '.login-btn') return el('login-btn');
        return null;
      },
      querySelectorAll: () => [],
      body: { classList: classList() }
    },
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {}
    },
    notify: (msg, type) => { notifications.push({ msg, type }); },
    currentUser: null,
    settings: { colorScheme: 'clinical-blue', backup: { providers: {}, cloudProvider: 'google' } },
    users: [],
    SettingsGuard: undefined,
    BootFlow: {
      ensureLoginAccessible() {
        login.classList.remove('hidden');
      },
      updateLoginSetupHint() {}
    },
    CommercialLicense: undefined
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  // Extract and eval the auth + license UX helpers from index.html
  const extract = (startNeedle, endNeedle) => {
    const a = html.indexOf(startNeedle);
    const b = html.indexOf(endNeedle, a);
    check(a >= 0 && b > a, `extract failed: ${startNeedle}`);
    return html.slice(a, b);
  };

  const authChunk = extract(
    'let _appAuthed = false;',
    'const USER_SESSION_KEY = \'__tdw_user_session__\';'
  ) + '\n'
    + 'var currentUser = null;\n'
    + extract('function dbSetGuarded(key, value)', 'function setAppAuthed(authed)')
    + '\n'
    + extract('function setAppAuthed(authed)', 'function requireAuth(actionLabel)');

  const uxChunk = extract(
    'let _licCheckSeq = 0;',
    '// Hard block — fingerprint mismatch only'
  ) + '\n'
    + 'var _licStatus = "none";\n'
    + 'var _licBlocked = false;\n'
    + 'var _licDaysLeft = null;\n'
    + 'var _licExpiringSoon = false;\n'
    + 'var _pendingLicTab = null;\n'
    + 'function _licApplyLoginRestrictions(){}\n'
    + 'function licUpdateLoginDevNotice(){}\n'
    + 'function licUpdateLoginDriveBootstrapPanel(){}\n'
    + 'function licUpdateLicDriveBootstrapPanel(){}\n'
    + 'function licRenderDeviceIdInfo(){}\n'
    + 'function licLog(){}\n'
    + 'function licLoad(){ return null; }\n'
    + 'function licLoadMeta(){ return {}; }\n'
    + 'function licSaveMeta(){}\n'
    + 'function licGetFingerprint(){ return "fp"; }\n'
    + extract('function ensureUserLoginScreenVisible()', '// Expose for inline onclick handlers')
    + html.slice(
      html.indexOf('// Expose for inline onclick handlers'),
      html.indexOf('async function licDevLogin()')
    );

  try {
    vm.runInNewContext(authChunk + '\n' + uxChunk, sandbox, { timeout: 5000 });
  } catch (e) {
    errors.push('vm eval UX helpers failed: ' + e.message);
  }

  // Pre-auth allowlist
  if (typeof sandbox.isPreAuthDbKeyAllowed === 'function') {
    check(sandbox.isPreAuthDbKeyAllowed('settings') === true, 'settings should be pre-auth allowed');
    check(sandbox.isPreAuthDbKeyAllowed('__tdw_meta__') === true, '__tdw_meta__ should be pre-auth allowed');
    check(sandbox.isPreAuthDbKeyAllowed('cases') === false, 'cases must stay blocked pre-auth');
    check(sandbox.dbSetGuarded('settings', { ok: 1 }) === true, 'dbSetGuarded settings must allow');
    check(sandbox.dbSetGuarded('cases', []) === false, 'dbSetGuarded cases must block');
    check(notifications.length === 0, 'dbSetGuarded must not toast on blocked pre-auth write');
  } else {
    errors.push('isPreAuthDbKeyAllowed not exported in sandbox');
  }

  // Open then close license must restore login (no blank viewport)
  if (typeof sandbox.openLicenseScreen === 'function' && typeof sandbox.closeLicenseScreen === 'function') {
    sandbox.openLicenseScreen();
    check(login.classList.contains('hidden') === true, 'openLicenseScreen should hide login');
    check(license.classList.contains('hidden') === false, 'openLicenseScreen should show license');
    sandbox.closeLicenseScreen();
    check(login.classList.contains('hidden') === false, 'closeLicenseScreen must show login again');
    check(license.classList.contains('hidden') === true, 'closeLicenseScreen must hide license');
    check(sandbox.assertPreAuthViewport() === true, 'viewport must be valid after close');
  } else {
    errors.push('open/closeLicenseScreen missing in sandbox');
  }

  // Stuck status finalize
  status.textContent = 'جارٍ التحقق من الترخيص...';
  sandbox._licStatus = 'none';
  sandbox.finalizeLicCheckUi('timeout-test');
  check(!/جار/.test(status.textContent), 'finalizeLicCheckUi must clear pending status text');
}

if (errors.length) {
  console.error('FAIL: login license UX');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: login license UX checks');
