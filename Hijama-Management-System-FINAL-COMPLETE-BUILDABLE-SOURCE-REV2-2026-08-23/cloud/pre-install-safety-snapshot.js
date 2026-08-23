/**
 * RC Hotfix Round 1 — pre-install / pre-migration safety .tdw snapshot.
 * One validated Backup V2 archive before mutating existing profile data.
 */
(function (global) {
  'use strict';

  const SAFETY_LABEL_AR = 'نسخة أمان قبل التحديث';
  const BACKUP_TYPE = 'pre-install-or-migration';

  function getBackupApi() {
    return global.cuppingElectron?.backup
      || global.tadawiElectron?.backup
      || global.tadawi?.backup
      || null;
  }

  function hasExistingOperationalData(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      try {
        const clients = global.DB?.get?.('clientsRegistry', []) || global.DB?.get?.('clients', []);
        if (Array.isArray(clients) && clients.length > 0) return true;
        if (global.SqliteBridge?.isPrimary?.()) {
          const st = global.SqliteBridge?.getStatus?.();
          if (st?.counts && Object.values(st.counts).some((n) => Number(n) > 0)) return true;
        }
      } catch { /* empty */ }
      return false;
    }
    const keys = ['clientsRegistry', 'clients', 'cases', 'bookings', 'doctors'];
    for (const k of keys) {
      const v = snapshot[k];
      if (Array.isArray(v) && v.length > 0) return true;
    }
    const settings = snapshot.settings;
    if (settings && typeof settings === 'object' && Object.keys(settings).length > 3) return true;
    return false;
  }

  async function createPreInstallSafetyTdw(options = {}) {
    const api = getBackupApi();
    if (!api?.v2Create) {
      return { ok: false, error: 'backup_v2_unavailable', blocked: true };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const result = await api.v2Create({
      backupType: BACKUP_TYPE,
      cloud: false,
      label: options.label || SAFETY_LABEL_AR,
      subdir: 'Safety',
      filenameHint: `${stamp}-pre-install-or-migration.tdw`,
      scopeTruth: true,
    });
    if (!result?.ok || !result?.filePath) {
      return {
        ok: false,
        blocked: true,
        error: result?.error || 'safety_tdw_create_failed',
        detail: result,
      };
    }
    if (api.v2Inspect) {
      try {
        const inspected = await api.v2Inspect({ filePath: result.filePath });
        if (inspected?.validation && inspected.validation !== 'valid' && inspected.ok === false) {
          return {
            ok: false,
            blocked: true,
            error: 'safety_tdw_validation_failed',
            filePath: result.filePath,
            detail: inspected,
          };
        }
      } catch (err) {
        return {
          ok: false,
          blocked: true,
          error: 'safety_tdw_validation_failed',
          message: err.message || String(err),
          filePath: result.filePath,
        };
      }
    }
    return {
      ok: true,
      filePath: result.filePath,
      label: SAFETY_LABEL_AR,
      backupType: BACKUP_TYPE,
    };
  }

  /**
   * If existing data: create ONE .tdw before migration. Empty machine: skip.
   */
  async function ensureSafetySnapshotBeforeMigration(options = {}) {
    const snapshot = options.snapshot || null;
    if (!hasExistingOperationalData(snapshot)) {
      return { ok: true, skipped: true, reason: 'no_existing_data' };
    }
    const created = await createPreInstallSafetyTdw(options);
    if (!created.ok) {
      return {
        ok: false,
        blocked: true,
        error: created.error || 'safety_snapshot_required',
        message: 'تعذّر إنشاء نسخة أمان .tdw — تم إيقاف التحديث/الترحيل لحماية بياناتك.',
        detail: created,
      };
    }
    try {
      global.DB?.set?.('__tdw_pre_install_safety__', {
        filePath: created.filePath,
        createdAt: new Date().toISOString(),
        label: SAFETY_LABEL_AR,
      });
    } catch { /* empty */ }
    return created;
  }

  global.PreInstallSafetySnapshot = {
    SAFETY_LABEL_AR,
    BACKUP_TYPE,
    hasExistingOperationalData,
    createPreInstallSafetyTdw,
    ensureSafetySnapshotBeforeMigration,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PreInstallSafetySnapshot;
  }
})(typeof window !== 'undefined' ? window : globalThis);
