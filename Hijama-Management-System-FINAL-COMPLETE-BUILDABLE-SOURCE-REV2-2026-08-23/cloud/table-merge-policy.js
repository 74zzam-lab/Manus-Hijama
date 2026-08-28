/**
 * Table Merge Policy — per-table merge strategies (not one-size-fits-all).
 */
(function (global) {
  'use strict';

  const STRATEGIES = {
    LATEST_WINS: 'latest_wins',
    MERGE_FIELDS: 'merge_fields',
    STRICT_CONFLICT: 'strict_conflict',
    SECTION_AWARE: 'section_aware',
    MOVEMENT_AWARE: 'movement_aware',
    APPEND_UNION: 'append_union'
  };

  const TABLE_POLICIES = {
    attendance: { strategy: STRATEGIES.LATEST_WINS, label: 'الحضور', caution: 'low' },
    clientsRegistry: { strategy: STRATEGIES.MERGE_FIELDS, label: 'العملاء', caution: 'medium' },
    doctors: { strategy: STRATEGIES.MERGE_FIELDS, label: 'الموظفون', caution: 'medium' },
    bookings: { strategy: STRATEGIES.LATEST_WINS, label: 'الحجوزات', caution: 'medium' },
    expenses: { strategy: STRATEGIES.STRICT_CONFLICT, label: 'المصروفات', caution: 'high' },
    cases: { strategy: STRATEGIES.STRICT_CONFLICT, label: 'الفواتير', caution: 'critical' },
    settings: { strategy: STRATEGIES.SECTION_AWARE, label: 'الإعدادات', caution: 'high' },
    services: { strategy: STRATEGIES.MERGE_FIELDS, label: 'الخدمات', caution: 'medium' },
    packages: { strategy: STRATEGIES.MERGE_FIELDS, label: 'الباقات', caution: 'medium' },
    users: {
      strategy: STRATEGIES.MERGE_FIELDS,
      label: 'المستخدمون',
      caution: 'critical',
      protectedFields: ['password', 'role', 'active', 'branchScope', 'permissions', 'credentialRevision', 'passwordChangedAt', 'sessionEpoch']
    },
    inventoryItems: { strategy: STRATEGIES.MOVEMENT_AWARE, label: 'المخزون', caution: 'high' },
    inventorySuppliers: { strategy: STRATEGIES.MERGE_FIELDS, label: 'موردو المخزون', caution: 'medium' },
    inventoryMovements: { strategy: STRATEGIES.MOVEMENT_AWARE, label: 'حركات المخزون', caution: 'critical' },
    attachments_meta: { strategy: STRATEGIES.STRICT_CONFLICT, label: 'مرفقات', caution: 'high', protectedFields: ['sha256'] },
    activityLog: { strategy: STRATEGIES.APPEND_UNION, label: 'سجل النشاط', caution: 'low' },
    messageLog: { strategy: STRATEGIES.APPEND_UNION, label: 'سجل الرسائل', caution: 'low' },
    nextSessions: { strategy: STRATEGIES.MERGE_FIELDS, label: 'الجلسات القادمة', caution: 'medium' },
    otRecords: { strategy: STRATEGIES.MERGE_FIELDS, label: 'سجلات الوقت الإضافي', caution: 'medium' },
    employeeLeaveRequests: { strategy: STRATEGIES.MERGE_FIELDS, label: 'طلبات الإجازة', caution: 'medium' },
    employeeLedgerAccruals: { strategy: STRATEGIES.STRICT_CONFLICT, label: 'مستحقات الموظفين', caution: 'high' },
    employeeLedgerPayments: { strategy: STRATEGIES.STRICT_CONFLICT, label: 'صرف مستحقات', caution: 'high' },
    employeeLedgerEntries: { strategy: STRATEGIES.STRICT_CONFLICT, label: 'دفتر الموظفين', caution: 'high' },
    importHistory: { strategy: STRATEGIES.APPEND_UNION, label: 'سجل الاستيراد', caution: 'low' },
    communicationWebhookLog: { strategy: STRATEGIES.APPEND_UNION, label: 'سجل الإرسال', caution: 'low' },
    systemLogs: { strategy: STRATEGIES.APPEND_UNION, label: 'سجل النظام', caution: 'low' },
    cashDrawerSession: { strategy: STRATEGIES.MERGE_FIELDS, label: 'عهدة الكاش', caution: 'high' },
    opsKv: { strategy: STRATEGIES.MERGE_FIELDS, label: 'عدادات وميزانية', caution: 'high' }
  };

  const DEFAULT_POLICY = { strategy: STRATEGIES.MERGE_FIELDS, label: '', caution: 'medium' };

  function getPolicy(table) {
    return TABLE_POLICIES[table] || DEFAULT_POLICY;
  }

  function compareRevision(local, remote) {
    return global.MergePolicy?.compareRevision?.(local, remote) || 0;
  }

  function overlappingFields(local, remote, ignoreExtra) {
    const ignore = new Set(['revision', 'updatedAt', 'updatedBy', 'deviceId', 'createdAt', 'createdBy', ...(ignoreExtra || [])]);
    const conflicts = [];
    const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
    keys.forEach(k => {
      if (ignore.has(k)) return;
      const lv = local?.[k];
      const rv = remote?.[k];
      if (lv === undefined || rv === undefined) return;
      if (JSON.stringify(lv) !== JSON.stringify(rv)) conflicts.push(k);
    });
    return conflicts;
  }

  function mergeComplementary(local, remote) {
    return {
      ...remote,
      ...local,
      revision: Math.max(Number(local?.revision) || 0, Number(remote?.revision) || 0) + 1
    };
  }

  function decideForTable(table, local, remote) {
    const policy = getPolicy(table);
    const ACTIONS = global.MergePolicy?.ACTIONS || {
      SKIP: 'skip', PUSH: 'push', PULL: 'pull', MERGE: 'merge', CONFLICT: 'conflict'
    };

    const tombDecision = global.TombstonePolicy?.decideTombstone?.(local, remote, table);
    if (tombDecision) {
      const mapped = global.TombstonePolicy?.tombstoneToMergeAction?.(tombDecision);
      if (mapped) return mapped;
    }

    if (!local && !remote) return { action: ACTIONS.SKIP };
    if (local && !remote) return { action: ACTIONS.PUSH, reason: 'local_only' };
    if (!local && remote) return { action: ACTIONS.PULL, reason: 'cloud_only' };

    if (global.MergePolicy?.isIdentical?.(local, remote)) {
      return { action: ACTIONS.SKIP, reason: 'identical' };
    }

    const fields = overlappingFields(local, remote);
    const protectedDiffs = fields.filter((field) => policy.protectedFields?.includes(field));
    const cmp = compareRevision(local, remote);

    // Authentication, authorization, and lifecycle fields are never a last-write-wins
    // decision. Any divergent protected field requires an owner-mediated conflict.
    if (protectedDiffs.length) {
      return { action: ACTIONS.CONFLICT, reason: 'protected_field', fields: protectedDiffs, local, remote };
    }

    switch (policy.strategy) {
      case STRATEGIES.LATEST_WINS:
        if (!fields.length) return { action: ACTIONS.MERGE, reason: 'complementary', merged: mergeComplementary(local, remote) };
        if (cmp > 0) return { action: ACTIONS.PUSH, reason: 'local_newer', fields };
        if (cmp < 0) return { action: ACTIONS.PULL, reason: 'cloud_newer', fields };
        return { action: ACTIONS.CONFLICT, reason: 'diverged', fields, local, remote };

      case STRATEGIES.MERGE_FIELDS:
        if (!fields.length) return { action: ACTIONS.MERGE, reason: 'complementary', merged: mergeComplementary(local, remote) };
        if (cmp !== 0) {
          const winner = cmp > 0 ? local : remote;
          const loser = cmp > 0 ? remote : local;
          const merged = mergeComplementary(loser, winner);
          return { action: ACTIONS.MERGE, reason: 'field_merge_newer_base', merged, fields };
        }
        return { action: ACTIONS.MERGE, reason: 'field_merge', merged: mergeComplementary(local, remote), fields };

      case STRATEGIES.STRICT_CONFLICT:
        if (fields.length) return { action: ACTIONS.CONFLICT, reason: 'strict', fields, local, remote };
        return { action: ACTIONS.MERGE, reason: 'complementary', merged: mergeComplementary(local, remote) };

      case STRATEGIES.SECTION_AWARE:
        if (!fields.length) return { action: ACTIONS.MERGE, reason: 'complementary', merged: mergeComplementary(local, remote) };
        if (cmp > 0) return { action: ACTIONS.PUSH, reason: 'local_newer', fields };
        if (cmp < 0) return { action: ACTIONS.PULL, reason: 'cloud_newer', fields };
        return { action: ACTIONS.CONFLICT, reason: 'settings_diverged', fields, local, remote };

      case STRATEGIES.MOVEMENT_AWARE:
        if (table === 'inventoryMovements') {
          return { action: ACTIONS.MERGE, reason: 'movement_union', merged: mergeComplementary(local, remote) };
        }
        if (!fields.length) return { action: ACTIONS.MERGE, reason: 'complementary', merged: mergeComplementary(local, remote) };
        const localQty = Number(local?.quantity ?? local?.qty ?? local?.stock ?? 0);
        const remoteQty = Number(remote?.quantity ?? remote?.qty ?? remote?.stock ?? 0);
        const localMoves = Number(local?.movementCount ?? 0);
        const remoteMoves = Number(remote?.movementCount ?? 0);
        if (localMoves > remoteMoves || (localMoves === remoteMoves && localQty !== remoteQty && cmp > 0)) {
          return { action: ACTIONS.PUSH, reason: 'more_movements_local', fields, local, remote };
        }
        if (remoteMoves > localMoves || (localMoves === remoteMoves && localQty !== remoteQty && cmp < 0)) {
          return { action: ACTIONS.PULL, reason: 'more_movements_cloud', fields, local, remote };
        }
        return { action: ACTIONS.CONFLICT, reason: 'inventory_diverged', fields, local, remote };

      case STRATEGIES.APPEND_UNION:
        return { action: ACTIONS.MERGE, reason: 'append_union', merged: mergeComplementary(local, remote) };

      default:
        return global.MergePolicy?.decideRecord?.(local, remote) || { action: ACTIONS.CONFLICT, local, remote };
    }
  }

  function decideTable(table, localRecords, remoteRecords) {
    localRecords = Array.isArray(localRecords) ? localRecords : [];
    remoteRecords = Array.isArray(remoteRecords) ? remoteRecords : [];
    const byIdLocal = new Map(localRecords.filter(r => r?.id).map(r => [r.id, r]));
    const byIdRemote = new Map(remoteRecords.filter(r => r?.id).map(r => [r.id, r]));
    const ids = new Set([...byIdLocal.keys(), ...byIdRemote.keys()]);
    const ACTIONS = global.MergePolicy?.ACTIONS || {};

    const stats = { skip: 0, push: 0, pull: 0, merge: 0, conflict: 0 };
    const merged = [];
    const conflicts = [];
    const toPush = [];
    const toPull = [];

    ids.forEach(id => {
      const decision = decideForTable(table, byIdLocal.get(id), byIdRemote.get(id));
      switch (decision.action) {
        case ACTIONS.SKIP:
        case 'skip':
          stats.skip++;
          merged.push(byIdLocal.get(id) || byIdRemote.get(id));
          break;
        case ACTIONS.PUSH:
        case 'push':
          stats.push++;
          toPush.push(byIdLocal.get(id));
          merged.push(byIdLocal.get(id));
          break;
        case ACTIONS.PULL:
        case 'pull':
          stats.pull++;
          toPull.push(byIdRemote.get(id));
          merged.push(byIdRemote.get(id));
          break;
        case ACTIONS.MERGE:
        case 'merge':
          stats.merge++;
          merged.push(decision.merged || mergeComplementary(byIdLocal.get(id), byIdRemote.get(id)));
          break;
        case ACTIONS.CONFLICT:
        case 'conflict':
        default:
          stats.conflict++;
          conflicts.push({ id, table, policy: getPolicy(table).strategy, ...decision });
          merged.push(byIdLocal.get(id));
          break;
      }
    });

    return {
      ok: conflicts.length === 0,
      table,
      policy: getPolicy(table),
      stats,
      merged,
      conflicts,
      toPush,
      toPull,
      hasConflict: conflicts.length > 0,
      safeAutoMerge: conflicts.length === 0
    };
  }

  global.TableMergePolicy = {
    STRATEGIES,
    TABLE_POLICIES,
    getPolicy,
    decideForTable,
    decideTable,
    overlappingFields
  };
})(typeof window !== 'undefined' ? window : globalThis);
