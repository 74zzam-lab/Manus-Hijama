#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — Electron security hardening verification.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const os = require('os');

const root = path.join(__dirname, '..', '..');
const errors = [];

function check(cond, msg) {
  if (!cond) errors.push(msg);
}

async function main() {
  const mainSrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  const printPreload = fs.readFileSync(path.join(root, 'electron', 'security', 'preload-print.js'), 'utf8');

  check(mainSrc.includes('sandbox: true'), 'main must enable sandbox:true');
  check(mainSrc.includes('secureWebPreferences'), 'webSecurity via secureWebPreferences');
  check(!/nodeIntegration:\s*true/.test(mainSrc), 'nodeIntegration must not be true');
  check(mainSrc.includes('preload-print'), 'child windows must use print preload');
  check(mainSrc.includes('openExternalSafe') || mainSrc.includes('app:openExternal'), 'external open must be gated');
  check(mainSrc.includes('applyContentSecurityPolicy'), 'CSP must be applied');
  check(mainSrc.includes('applyPermissionPolicy'), 'permission policy must be applied');
  check(preloadSrc.includes("exposeInMainWorld('tadawi'"), 'tadawi typed API required');
  check(preloadSrc.includes('ALLOWED_INVOKE'), 'preload channel allowlist required');
  check(!preloadSrc.includes('invoke: (channel'), 'no generic invoke API');
  check(!printPreload.includes('backup:'), 'print preload must not expose backup');
  check(!printPreload.includes('license:'), 'print preload must not expose license');

  const pathGuard = require(path.join(root, 'electron', 'security', 'path-guard'));
  check(pathGuard.hasTraversal('../etc/passwd'), 'detect ../');
  check(pathGuard.hasTraversal('..\\windows\\system32'), 'detect ..\\');
  check(pathGuard.hasTraversal('foo/../../bar'), 'detect nested traversal');
  check(pathGuard.isAbsoluteOrUnc('C:\\Temp\\x'), 'detect drive path');
  check(pathGuard.isAbsoluteOrUnc('/etc/passwd'), 'detect absolute posix');
  check(pathGuard.isAbsoluteOrUnc('\\\\server\\share'), 'detect UNC');

  let threw = false;
  try { pathGuard.safeFilename('../evil.json'); } catch (e) { threw = e.code === 'PATH_TRAVERSAL'; }
  check(threw, 'safeFilename rejects traversal');

  threw = false;
  try { pathGuard.safeId('../../L1', 'licenseId'); } catch (e) { threw = e.code === 'PATH_TRAVERSAL'; }
  check(threw, 'safeId rejects traversal');

  threw = false;
  try { pathGuard.safeId('L000001', 'licenseId'); } catch { threw = true; }
  check(!threw, 'safeId accepts L000001');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-path-'));
  threw = false;
  try { pathGuard.resolveInside(tmpRoot, '..', 'outside.txt'); } catch (e) { threw = e.code === 'PATH_TRAVERSAL'; }
  check(threw, 'resolveInside blocks escape');

  const V = require(path.join(root, 'electron', 'security', 'ipc-validate'));
  threw = false;
  try { V.asString('x'.repeat(V.MAX_STRING + 1), { name: 'payload' }); } catch (e) { threw = e.code === 'IPC_TOO_LARGE'; }
  check(threw, 'rejects oversized string');

  threw = false;
  try { V.asEnum('evil-provider', ['google'], { name: 'provider', required: true }); } catch (e) { threw = e.code === 'IPC_ENUM'; }
  check(threw, 'rejects unknown provider enum');

  threw = false;
  try { V.asHtml(''); } catch (e) { threw = e.code === 'IPC_REQUIRED'; }
  check(threw, 'rejects empty html');

  check(preloadSrc.includes('if (!ALLOWED_INVOKE.has(channel))'), 'deny unknown invoke channels');

  const { sanitizeText, sanitizePlainText, escapeHtml } = require(path.join(root, 'electron', 'security', 'sanitize-text'));
  const dirty = '<script>alert(1)</script>محمد';
  const cleaned = sanitizeText(dirty);
  check(!cleaned.includes('<script>'), 'sanitize strips script tags');
  check(!cleaned.includes('<') || cleaned.includes('&lt;'), 'sanitize escapes remainder');
  check(sanitizePlainText(dirty).includes('محمد'), 'plain sanitize keeps arabic name');
  check(escapeHtml('"').includes('&quot;'), 'escape quotes');
  check(!sanitizePlainText('<img src=x onerror=alert(1)>').includes('<img'), 'strip img xss');

  // Mock electron before loading modules that require it (works even when Electron binary is missing on Windows).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cupping-sec-bk-'));
  const origRequire = Module.prototype.require;
  Module.prototype.require = function mockedRequire(id) {
    if (id === 'electron') {
      return {
        app: {
          getPath: (name) => {
            if (name === 'documents') return path.join(tmp, 'documents');
            if (name === 'userData') return path.join(tmp, 'userData');
            return tmp;
          },
        },
        dialog: {},
        shell: {
          openExternal: async () => undefined,
        },
      };
    }
    return origRequire.apply(this, arguments);
  };

  try {
    const windowPolicyPath = path.join(root, 'electron', 'security', 'window-policy');
    delete require.cache[require.resolve(windowPolicyPath)];
    const windowPolicy = require(windowPolicyPath);
    check(windowPolicy.classifyWindowOpen('https://wa.me/9665', root) === 'external', 'wa.me is external');
    check(windowPolicy.classifyWindowOpen('about:blank', root) === 'print', 'blank is print');
    check(windowPolicy.classifyWindowOpen('file:///etc/passwd', root) === 'deny', 'foreign file denied');
    check(windowPolicy.isAllowedExternalUrl('javascript:alert(1)') === false, 'javascript: denied');
    check(windowPolicy.isAllowedExternalUrl('https://example.com') === true, 'https allowed');
    check(windowPolicy.DENIED_PERMISSIONS.has('media'), 'camera/mic media denied');
    check(windowPolicy.DENIED_PERMISSIONS.has('geolocation'), 'geo denied');
    check(windowPolicy.CSP.includes("object-src 'none'"), 'CSP blocks objects');
    check(windowPolicy.CSP.includes("script-src 'self' 'unsafe-inline'"), 'CSP keeps inline for legacy UI');
    check(windowPolicy.CSP.includes('script.google.com'), 'CSP allows Apps Script license vault');

    const backupPath = path.join(root, 'electron', 'backup.js');
    delete require.cache[require.resolve(backupPath)];
    const backup = require(backupPath);

    const abs = await backup.saveLocal('{}', 'x.json', 'C:\\Windows\\Temp');
    check(abs.ok === false, 'absolute backup path rejected');

    const trav = await backup.saveLocal('{}', '../evil.json', 'Documents/Hijama Management System/Backups');
    check(trav.ok === false, 'traversal filename rejected');

    const ok = await backup.saveLocal('{"ok":1}', 'safe-backup.json', 'Documents/Hijama Management System/Backups');
    check(ok.ok === true, 'safe Documents-relative backup allowed');
    check(ok.path && ok.path.includes('safe-backup.json'), 'safe backup written');
  } finally {
    Module.prototype.require = origRequire;
  }

  const licenseData = require(path.join(root, 'electron', 'license-data.js'));
  let licThrow = false;
  try {
    licenseData.writeLicenseShard('../evil', { licenseId: 'x' });
  } catch (e) {
    licThrow = e.code === 'PATH_TRAVERSAL' || /invalid|traversal/i.test(e.message);
  }
  check(licThrow, 'license shard traversal rejected');

  if (errors.length) {
    console.error('FAIL: phase-2 electron security');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: phase-2 electron security (sandbox, CSP, IPC allowlist, path traversal, XSS sanitize, window policy)');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
