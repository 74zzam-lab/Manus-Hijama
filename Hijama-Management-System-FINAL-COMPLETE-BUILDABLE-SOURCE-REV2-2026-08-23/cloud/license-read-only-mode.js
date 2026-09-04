/**
 * Expired/unlicensed session — all roles may login read-only:
 * view data, print reports, create backups (local/cloud) — no daily operations.
 */
(function (global) {
  'use strict';

  const ALLOWED_DB_KEYS = new Set(['backupLog', 'activityLog', 'messageLog', 'systemLogs']);
  let backupWriteToken = 0;

  function isLicenseInactive() {
    return global._licStatus === 'expired' || global._licStatus === 'none';
  }

  function isActive() {
    return !!global._appAuthed
      && !!global.currentUser
      && !global.currentUser.isDev
      && isLicenseInactive();
  }

  function syncSessionMode() {
    const active = isActive();
    global._licReadOnlyMode = active;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('license-readonly-mode', active);
      let banner = document.getElementById('license-readonly-banner');
      if (active) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'license-readonly-banner';
          banner.className = 'license-readonly-banner';
          banner.setAttribute('dir', 'rtl');
          banner.innerHTML = '👁️ <strong>وضع قراءة فقط</strong> — الترخيص منتهٍ أو غير مفعّل. يمكنك مراجعة البيانات، طباعة التقارير، وإنشاء نسخ احتياطية محلية/سحابية فقط — بدون إدخال يومي.';
          document.body.prepend(banner);
        }
      } else if (banner) {
        banner.remove();
      }
    }
    return active;
  }

  function isDbKeyWriteAllowed(key) {
    if (!isActive()) return true;
    if (!key || typeof key !== 'string') return false;
    if (ALLOWED_DB_KEYS.has(key)) return true;
    if (key === 'settings' && backupWriteToken > 0) return true;
    if (key === 'users' && global._pendingForcedPwChange) return true;
    if (/backup/i.test(key)) return true;
    return false;
  }

  function isDbKeyBlocked(key) {
    return isActive() && !isDbKeyWriteAllowed(key);
  }

  function runWithBackupWrite(fn) {
    backupWriteToken += 1;
    try { return fn(); } finally { backupWriteToken = Math.max(0, backupWriteToken - 1); }
  }

  async function runWithBackupWriteAsync(fn) {
    backupWriteToken += 1;
    try { return await fn(); } finally { backupWriteToken = Math.max(0, backupWriteToken - 1); }
  }

  function guardDailyWrite(actionLabel) {
    if (!isActive()) return true;
    const msg = actionLabel
      ? `⛔ وضع قراءة فقط — ${actionLabel}`
      : '⛔ وضع قراءة فقط — العمليات اليومية معطّلة';
    try {
      global.notify?.(
        `${msg}. يمكنك مراجعة البيانات، طباعة التقارير، وإنشاء نسخ احتياطية محلية/سحابية.`,
        'warning'
      );
    } catch { /* empty */ }
    return false;
  }

  function guardRestore(actionLabel) {
    if (!isActive()) return true;
    try {
      global.notify?.(
        `⛔ وضع قراءة فقط — ${actionLabel || 'الاستعادة معطّلة'}. أنشئ نسخة احتياطية فقط.`,
        'warning'
      );
    } catch { /* empty */ }
    return false;
  }

  function isBackupOnclick(onclick, label) {
    const s = String(onclick || '') + ' ' + String(label || '');
    return /runBackup|BackupV2|scanLocalBackups|scanCloudBackups|scanAllBackups|runBackupNow|saveBackupV2Schedule|نسخ/i.test(s)
      && !/restore|استعاد|Restore/i.test(s);
  }

  function applyUiLocks() {
    if (!isActive() || typeof document === 'undefined') return;
    document.querySelectorAll('button, .btn, .quick-action-btn, a.btn').forEach((el) => {
      const onclick = el.getAttribute('onclick') || '';
      const label = el.textContent || '';
      if (isBackupOnclick(onclick, label)) {
        el.classList.remove('perm-locked');
        el.disabled = false;
        el.style.display = '';
        return;
      }
      if (/restore|استعاد|Restore|openRestore/i.test(onclick + label)) {
        el.classList.add('perm-locked');
        el.disabled = true;
        return;
      }
      if (/print|طباع|Print|thermal|exportReport|تقرير/i.test(onclick + label)) {
        return;
      }
      if (/save|حفظ|delete|حذف|addCase|saveCase|saveBooking|saveExpense|saveAttendance|saveInventory|saveOT|saveUser|savePackage|saveDoctor|saveService/i.test(onclick)) {
        el.classList.add('perm-locked');
        el.disabled = true;
      }
    });
  }

  global.LicenseReadOnlyMode = {
    isLicenseInactive,
    isActive,
    syncSessionMode,
    isDbKeyWriteAllowed,
    isDbKeyBlocked,
    runWithBackupWrite,
    runWithBackupWriteAsync,
    guardDailyWrite,
    guardRestore,
    applyUiLocks,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LicenseReadOnlyMode;
  }
})(typeof window !== 'undefined' ? window : globalThis);
