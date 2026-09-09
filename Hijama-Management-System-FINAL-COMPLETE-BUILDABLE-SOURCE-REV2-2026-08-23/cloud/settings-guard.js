/**
 * Settings Guard — lock sensitive data, confirm risky edits, audit + restore points.
 */
(function (global) {
  'use strict';

  const GUARD_KEY = '__tdw_settings_guard__';
  const RESTORE_KEY = '__tdw_settings_restore__';

  const LOCK_GROUPS = {
    center: {
      label: 'بيانات المركز',
      fields: ['centerName', 'centerAddress', 'centerPhone', 'centerEmail', 'centerWebsite', 'centerCity', 'taxNum', 'crNum']
    },
    license: {
      label: 'الترخيص',
      keys: ['__tdw_cloud_license__']
    },
    google: {
      label: 'بيانات Google',
      path: 'settings.backup.providers.google'
    },
    centerId: {
      label: 'Center ID',
      keys: ['__tdw_meta__']
    },
    branches: {
      label: 'بيانات الفروع',
      keys: ['__tdw_cloud_license__']
    },
    system: {
      label: 'إعدادات النظام الأساسية',
      keys: ['settings', '__tdw_meta__', '__tdw_drive_folders__']
    }
  };

  const TABLE_KEYS = new Set([
    'settings', 'users', 'cases', 'clientsRegistry', 'bookings', 'doctors',
    'expenses', 'packages', 'services', 'activityLog', 'attendance',
    'inventoryItems', 'inventorySuppliers', 'inventoryMovements'
  ]);

  function loadGuard() {
    const raw = global.DB?.get?.(GUARD_KEY, null);
    if (raw && typeof raw === 'object') return raw;
    return { locked: {}, updatedAt: null, updatedBy: null };
  }

  function saveGuard(g) {
    g.updatedAt = new Date().toISOString();
    g.updatedBy = global.currentUser?.fullName || global.currentUser?.username || 'system';
    global.DB?.set?.(GUARD_KEY, g);
    return g;
  }

  function isGroupLocked(groupId) {
    const g = loadGuard();
    return !!g.locked?.[groupId];
  }

  function setGroupLocked(groupId, locked) {
    const g = loadGuard();
    g.locked = g.locked || {};
    if (locked) g.locked[groupId] = true;
    else delete g.locked[groupId];
    saveGuard(g);
    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: locked ? 'SETTINGS_LOCKED' : 'SETTINGS_UNLOCKED',
        entity: 'settings_guard',
        entityId: groupId,
        summary: `${LOCK_GROUPS[groupId]?.label || groupId} — ${locked ? 'مقفل' : 'مفتوح'}`
      });
    }
    return g;
  }

  function canEditGroup(groupId, user) {
    user = user || global.currentUser;
    if (!isGroupLocked(groupId)) return { ok: true };
    if (user?.isDev || global.RolePolicy?.isManager?.(user)) {
      return { ok: true, override: true };
    }
    return {
      ok: false,
      error: 'settings_locked',
      message: `⛔ ${LOCK_GROUPS[groupId]?.label || 'هذه البيانات'} مقفلة بواسطة المدير`
    };
  }

  function createRestorePoint(label) {
    const snapshot = {};
    ['settings', 'users', '__tdw_cloud_license__', '__tdw_meta__', '__tdw_drive_folders__'].forEach(k => {
      const v = global.DB?.get?.(k, null);
      if (v != null) snapshot[k] = v;
    });
    const point = {
      id: 'rp-' + Date.now(),
      label: label || 'restore',
      createdAt: new Date().toISOString(),
      createdBy: global.currentUser?.fullName || 'system',
      snapshot
    };
    const list = global.DB?.get?.(RESTORE_KEY, []) || [];
    list.unshift(point);
    global.DB?.set?.(RESTORE_KEY, list.slice(0, 10));
    return point;
  }

  function restorePoint(id) {
    if (!global.RolePolicy?.isManager?.(global.currentUser)) {
      return { ok: false, error: 'manager_required' };
    }
    const list = global.DB?.get?.(RESTORE_KEY, []) || [];
    const point = list.find(p => p.id === id);
    if (!point?.snapshot) return { ok: false, error: 'not_found' };
    const backupPayload = {};
    if (point.snapshot.settings) backupPayload.settings = point.snapshot.settings;
    if (point.snapshot.users) backupPayload.users = point.snapshot.users;
    ['__tdw_cloud_license__', '__tdw_meta__', '__tdw_drive_folders__'].forEach(k => {
      if (point.snapshot[k] != null) global.DB?.set?.(k, point.snapshot[k]);
    });
    if (global.SyncedWrite?.restoreFromBackup && (backupPayload.settings || backupPayload.users)) {
      return global.SyncedWrite.restoreFromBackup(backupPayload, { source: 'settings_restore_point' });
    }
    Object.entries(point.snapshot).forEach(([k, v]) => {
      if (k === '__tdw_cloud_license__' || k === '__tdw_meta__' || k === '__tdw_drive_folders__') return;
      global.DB?.set?.(k, v);
    });
    return { ok: true, point };
  }

  function guardSettingsPatch(patch) {
    if (!patch || typeof patch !== 'object') return { ok: true };
    for (const [groupId, def] of Object.entries(LOCK_GROUPS)) {
      if (!def.fields || !isGroupLocked(groupId)) continue;
      const touched = def.fields.some(f => Object.prototype.hasOwnProperty.call(patch, f));
      if (touched) {
        const gate = canEditGroup(groupId);
        if (!gate.ok) return gate;
      }
    }
    return { ok: true };
  }

  function dbSetGuarded(key, value) {
    if (LOCK_GROUPS.license.keys?.includes(key) && isGroupLocked('license')) {
      const gate = canEditGroup('license');
      if (!gate.ok) {
        global.notify?.(gate.message, 'danger');
        return false;
      }
    }
    if (LOCK_GROUPS.centerId.keys?.includes(key) && isGroupLocked('centerId')) {
      const gate = canEditGroup('centerId');
      if (!gate.ok) {
        global.notify?.(gate.message, 'danger');
        return false;
      }
    }
    if (key === 'settings' && value && typeof value === 'object') {
      const gate = guardSettingsPatch(value);
      if (!gate.ok) {
        global.notify?.(gate.message, 'danger');
        return false;
      }
    }
    return true;
  }

  async function confirmRiskyChange(title, details) {
    const msg = `${title}\n\n${details || ''}\n\nهل تريد المتابعة؟`;
    if (typeof global.confirm !== 'function') return true;
    return global.confirm(msg);
  }

  global.SettingsGuard = {
    GUARD_KEY,
    LOCK_GROUPS,
    loadGuard,
    saveGuard,
    isGroupLocked,
    setGroupLocked,
    canEditGroup,
    createRestorePoint,
    restorePoint,
    guardSettingsPatch,
    dbSetGuarded,
    confirmRiskyChange
  };

  global.dbSetGuardedSettings = dbSetGuarded;
})(typeof window !== 'undefined' ? window : globalThis);
