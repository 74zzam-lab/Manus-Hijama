/**
 * V2-5.10 — Fast Cloud Data Discovery + Confirmed Restore (renderer).
 * Discovery is metadata-only. Restore starts only after explicit user confirm.
 * SyncEngine must NOT start during discovery.
 */
(function (global) {
  'use strict';

  const DISCOVERY_TIMEOUT_MS = 150000;
  const NO_PROGRESS_WATCHDOG_MS = 35000;

  const RESTORE_STAGES = [
    { id: 'verify_point', label: 'التحقق من نقطة السحابة', weight: 5 },
    { id: 'local_safety', label: 'الاحتفاظ بالحالة المحلية', weight: 5 },
    { id: 'download_db', label: 'سحب حالة السحابة (metadata)', weight: 25 },
    { id: 'download_attachments', label: 'تنزيل المرفقات الناقصة', weight: 10 },
    { id: 'checksums', label: 'التحقق من Checksums', weight: 8 },
    { id: 'cloud_merge', label: 'دمج حالة السحابة (بدون استبدال DB)', weight: 20 },
    { id: 'remote_compare', label: 'مقارنة أحدث التغييرات السحابية', weight: 10 },
    { id: 'reconcile', label: 'Reconciliation', weight: 12 },
    { id: 'restart_prep', label: 'تجهيز المتابعة', weight: 5 },
  ];

  let discoveryOpId = 0;
  let restoreOpId = 0;
  let discoveryLock = false;
  let restoreLock = false;
  let activeAbort = null;
  let lastDiscovery = null;

  function bridge() {
    const electronBackup = global.cuppingElectron?.backup
      || global.tadawiElectron?.backup
      || global.tadawi?.backup
      || null;
    // Prefer Electron IPC when BackupBridge lacks discovery (older wrappers).
    if (electronBackup?.discoverCloudRestorePoints) return electronBackup;
    if (global.BackupBridge?.discoverCloudRestorePoints) return global.BackupBridge;
    return global.BackupBridge || electronBackup || null;
  }

  function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    return `${(v / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(iso);
    }
  }

  function getIdentity() {
    const lic = global.LicenseCloud?.loadLocal?.() || global.LicenseV6?.getActiveLicense?.() || null;
    const centerId = lic?.centerId
      || global.CenterId?.get?.()
      || global.DeviceConfig?.load?.()?.centerId
      || null;
    const branchId = global.DeviceConfig?.load?.()?.lockedBranchId
      || global.BranchScope?.getActiveBranchId?.()
      || lic?.branchId
      || null;
    const centerName = lic?.centerName || lic?.organizationName || global.DeviceConfig?.load?.()?.centerName || '';
    const branchName = (lic?.branches || []).find((b) => b && b.id === branchId)?.name
      || global.DeviceConfig?.load?.()?.branchName
      || '';
    return { lic, centerId, branchId, branchName, centerName };
  }

  function probeLocalDatabase() {
    const started = Date.now();
    try {
      const clients = global.DB?.get?.('clients');
      const hasData = Array.isArray(clients) ? clients.length > 0
        : !!(global.DB?.get?.('settings') || global.SqliteBridge?.isPrimary?.());
      const pathHint = global.cuppingElectron?.getUserDataPath?.()
        || global.tadawiElectron?.getUserDataPath?.()
        || 'localStorage / SQLite';
      return {
        ok: true,
        available: true,
        status: hasData ? 'valid' : 'empty_or_new',
        path: pathHint,
        modifiedAt: null,
        durationMs: Date.now() - started,
        message: hasData ? 'بيانات محلية موجودة' : 'لا توجد بيانات تشغيلية محلية غنية',
      };
    } catch (err) {
      return {
        ok: false,
        available: false,
        status: 'error',
        durationMs: Date.now() - started,
        message: err.message || String(err),
      };
    }
  }

  async function probeLocalBackups() {
    const started = Date.now();
    const b = bridge();
    try {
      if (b?.v2ListLocal) {
        const listed = await b.v2ListLocal();
        const files = listed?.files || [];
        const newest = files[0] || null;
        return {
          ok: true,
          available: files.length > 0,
          status: files.length ? 'ready' : 'not_found',
          count: files.length,
          newest,
          durationMs: Date.now() - started,
          message: files.length ? `وُجدت ${files.length} نسخة محلية` : 'لا توجد نسخ Backup V2 محلية',
        };
      }
      return {
        ok: true,
        available: false,
        status: 'unavailable',
        durationMs: Date.now() - started,
        message: 'قائمة النسخ المحلية غير متاحة',
      };
    } catch (err) {
      return {
        ok: false,
        available: false,
        status: 'error',
        durationMs: Date.now() - started,
        message: err.message || String(err),
      };
    }
  }

  /**
   * Parallel Fast Discovery for all data-source cards.
   * Must NOT start SyncEngine, download DB, decrypt, or hydrate.
   */
  async function discoverAllSources(options = {}) {
    if (discoveryLock) {
      return { ok: false, error: 'discovery_in_flight', last: lastDiscovery };
    }
    discoveryLock = true;
    const opId = ++discoveryOpId;
    const abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeAbort = abort;
    const started = Date.now();
    const identity = getIdentity();
    const lic = identity.lic || {};
    const localBranches = Array.isArray(lic.branches) ? lic.branches : [];

    // Hard rule: never start sync during discovery
    const syncWasRunning = !!global.SyncEngine?.isRunning?.();
    if (global.SyncEngine?.stop && syncWasRunning) {
      try { global.SyncEngine.stop(); } catch { /* empty */ }
    }

    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const timeoutMs = options.timeoutMs || DISCOVERY_TIMEOUT_MS;
    const emitDiscovery = (snap) => {
      if (!onProgress) return;
      try { onProgress(snap); } catch { /* observer only */ }
    };

    emitDiscovery(buildDiscoveryProgressState({
      label: 'بدء الفحص — سحابة / محلي / نسخ',
      elapsedMs: 0,
      budgetMs: timeoutMs,
      percent: 5,
      stageId: 'oauth',
    }));

    // Progress from main-process discovery only — no fake time-based tick.

    const electronBackup = global.cuppingElectron?.backup || global.tadawiElectron?.backup || null;
    if (electronBackup?.onDiscoveryProgress) {
      electronBackup.onDiscoveryProgress((payload) => {
        if (opId !== discoveryOpId) return;
        emitDiscovery(buildDiscoveryProgressState({
          ...payload,
          elapsedMs: payload.elapsedMs || (Date.now() - started),
          budgetMs: payload.budgetMs || timeoutMs,
        }));
      });
    }

    const cloudPromise = (async () => {
      const b = bridge();
      if (!b?.discoverCloudRestorePoints) {
        // Fallback: connection-only probe — never recursive listCloudBackups
        const connected = !!global.DriveAdapter?.isConnected?.();
        return {
          ok: true,
          status: connected ? 'ipc_missing' : 'offline',
          message: connected
            ? 'قناة اكتشاف السحابة غير متاحة في هذه النسخة — حدّث التطبيق.'
            : 'حساب Google غير متصل.',
          restorePoints: [],
          newest: null,
          downloadedFullBackup: false,
          durationMs: 0,
          googleConnected: connected,
        };
      }
      return b.discoverCloudRestorePoints({
        centerId: identity.centerId,
        branchId: identity.branchId,
        branchName: identity.branchName,
        centerName: identity.centerName,
        localBranches,
        timeoutMs,
      });
    })();

    try {
      const [cloud, localDb, localBackup] = await Promise.all([
        cloudPromise.catch((err) => ({
          ok: false,
          status: 'error',
          message: err.message || String(err),
          restorePoints: [],
          newest: null,
          downloadedFullBackup: false,
        })),
        Promise.resolve().then(probeLocalDatabase),
        probeLocalBackups(),
      ]);

      emitDiscovery(buildDiscoveryProgressState({
        label: 'اكتمل الفحص',
        elapsedMs: Date.now() - started,
        budgetMs: timeoutMs,
        percent: 100,
        stageId: 'done',
        foundCount: cloud?.restorePoints?.length || 0,
        backupCount: cloud?.latestBackups?.length
          || cloud?.restorePoints?.filter?.((p) => p.kind === 'backup_v2' || p.kind === 'backup_file')?.length
          || 0,
        summary: cloud?.summary || null,
        realProgress: true,
      }));

      if (opId !== discoveryOpId) {
        return { ok: false, error: 'stale_discovery', ignored: true };
      }

      // Guard: discovery must never have downloaded a full backup
      if (cloud?.downloadedFullBackup) {
        cloud.status = 'error';
        cloud.message = 'اكتشاف غير آمن: تم تنزيل نسخة كاملة أثناء الفحص.';
      }

      const result = {
        ok: true,
        opId,
        identity,
        durationMs: Date.now() - started,
        cloud,
        localDb,
        localBackup,
        filePick: { available: true, status: 'ready', message: 'اختيار ملف Backup / Database' },
        emptyStart: { available: true, status: 'ready', message: 'البدء بدون بيانات سابقة' },
        syncEngineStarted: false,
        downloadedFullBackup: !!cloud?.downloadedFullBackup,
        instrumentation: cloud?.instrumentation || null,
      };
      lastDiscovery = result;
      return result;
    } catch (err) {
      throw err;
    } finally {
      if (opId === discoveryOpId) {
        discoveryLock = false;
        if (activeAbort === abort) activeAbort = null;
      }
    }
  }

  function buildDiscoveryProgressState(extra = {}) {
    const budgetMs = extra.budgetMs || DISCOVERY_TIMEOUT_MS;
    const elapsedMs = extra.elapsedMs || 0;
    const percent = extra.percent != null
      ? extra.percent
      : (extra.stageId ? 5 : null);
    const stalled = !!extra.stalled;
    let etaLine = '';
    if (extra.etaMs != null && extra.etaMs > 0) {
      etaLine = ` · متبقٍ ~${Math.round(extra.etaMs / 1000)}ث`;
    }
    return {
      phase: extra.phase || 'discovery',
      stageId: extra.stageId || extra.stage || null,
      stageLabel: extra.label || 'فحص مصادر البيانات',
      stageIndex: extra.foldersDone || 0,
      stageCount: extra.foldersTotal || null,
      percent: percent != null ? percent : 5,
      elapsedMs,
      etaMs: extra.etaMs || null,
      lastActivity: extra.folder
        ? `Drive: ${extra.folder}`
        : (stalled
          ? `لم يصل تقدم جديد منذ ${Math.round((extra.stalledMs || NO_PROGRESS_WATCHDOG_MS) / 1000)} ثانية`
          : (extra.label || 'فحص بيانات وصفية — بلا تنزيل')),
      foundCount: extra.foundCount || extra.backupCount || 0,
      backupCount: extra.backupCount || 0,
      budgetMs,
      stalled,
      summary: extra.summary || null,
      detailLine: `المنقضي: ${Math.round(elapsedMs / 1000)}ث${etaLine}${extra.backupCount ? ` · نسخ: ${extra.backupCount}` : ''}`,
    };
  }

  function formatDiscoverySummaryHtml(summary) {
    if (!summary) return '';
    const backupLine = summary.backupsDetail
      || (summary.backupsBreakdown
        ? `${summary.backupsTotal ?? summary.backups ?? '—'} (${[
          summary.backupsBreakdown.automatic ? `دورية: ${summary.backupsBreakdown.automatic}` : '',
          summary.backupsBreakdown.manual ? `يدوية: ${summary.backupsBreakdown.manual}` : '',
          summary.backupsBreakdown.safety ? `أمان: ${summary.backupsBreakdown.safety}` : '',
        ].filter(Boolean).join(' · ')})`
        : (summary.backupsTotal != null && summary.backupsRetention != null
          ? `${summary.backupsTotal} (دورية retention: ${summary.backupsRetention})`
          : (summary.backups ?? '—')));
    const attachLine = summary.attachments != null
      ? summary.attachments
      : 'غير متاح في metadata';
    const branchLine = summary.branchesInLicense != null && summary.branchesInBackup != null
      && summary.branchesInLicense !== summary.branchesInBackup
      ? `${summary.branchesInLicense} (في الترخيص) · ${summary.branchesInBackup} (في النسخة)`
      : (summary.branches ?? '—');
    const rows = [
      ['Google', summary.googleConnected ? 'متصل ✓' : 'غير متصل'],
      ['المؤسسات', summary.organizations ?? '—'],
      ['التراخيص', summary.licenses ?? '—'],
      ['الفروع', branchLine],
      ['الأجهزة', summary.devices ?? '—'],
      ['مجموعات البيانات', summary.datasets ?? '—'],
      ['Backup V2', backupLine],
      ['Attachments', attachLine],
    ];
    return rows.map(([k, v]) => `<div>${k}: <strong>${v}</strong></div>`).join('');
  }

  /**
   * Unified cloud scan for Backup page — same engine/contract as BootFlow.
   * Idempotent: does not start sync or restore.
   */
  async function runCloudScanForBackupPage(options = {}) {
    if (discoveryLock) {
      return { ok: false, error: 'discovery_in_flight', last: lastDiscovery };
    }
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const result = await discoverAllSources({
      timeoutMs: options.timeoutMs || DISCOVERY_TIMEOUT_MS,
      onProgress,
    });
    const cloud = result?.cloud || {};
    return {
      ok: result?.ok !== false,
      cloud,
      latestBackups: cloud.latestBackups || [],
      restorePoints: cloud.restorePoints || [],
      summary: cloud.summary || null,
      newest: cloud.newest || null,
      durationMs: result?.durationMs || cloud.durationMs || 0,
      discovery: result,
    };
  }

  function buildProgressState(stageId, extra = {}) {
    const idx = RESTORE_STAGES.findIndex((s) => s.id === stageId);
    const totalWeight = RESTORE_STAGES.reduce((a, s) => a + s.weight, 0);
    let doneWeight = 0;
    for (let i = 0; i < Math.max(0, idx); i += 1) doneWeight += RESTORE_STAGES[i].weight;
    const stage = RESTORE_STAGES[idx] || RESTORE_STAGES[0];
    const ratio = Math.min(0.99, (doneWeight + (stage?.weight || 0) * (extra.stageRatio || 0.15)) / totalWeight);
    return {
      stageId: stage?.id || stageId,
      stageLabel: stage?.label || stageId,
      stageIndex: idx + 1,
      stageCount: RESTORE_STAGES.length,
      percent: Math.round(ratio * 100),
      elapsedMs: extra.elapsedMs || 0,
      downloadedBytes: extra.downloadedBytes || 0,
      totalBytes: extra.totalBytes || null,
      filesDone: extra.filesDone || 0,
      filesTotal: extra.filesTotal || null,
      lastActivity: extra.lastActivity || stage?.label || '',
      diagnosticId: extra.diagnosticId || null,
      stalled: extra.stalled === true,
    };
  }

  function createRestoreProgressEmitter(onProgress, started, diagnosticId) {
    let lastProgressAt = Date.now();
    let currentStageId = 'verify_point';
    let lastStageRatio = 0.15;
    const emit = (stageId, extra = {}) => {
      currentStageId = stageId;
      if (extra.stageRatio != null) lastStageRatio = extra.stageRatio;
      lastProgressAt = Date.now();
      const snap = buildProgressState(stageId, {
        ...extra,
        elapsedMs: Date.now() - started,
        diagnosticId,
      });
      try { onProgress(snap); } catch { /* empty */ }
      return snap;
    };
    const startWatchdog = () => setInterval(() => {
      if (Date.now() - lastProgressAt > NO_PROGRESS_WATCHDOG_MS) {
        emit(currentStageId, {
          lastActivity: 'تحذير: لا يوجد تحديث منذ أكثر من 30 ثانية',
          stageRatio: lastStageRatio,
          stalled: true,
        });
      }
    }, 5000);
    return { emit, startWatchdog, touch: () => { lastProgressAt = Date.now(); } };
  }

  function resolveRestoreErrorMessage(errCode, fallback) {
    const truth = global.OperationalErrorTruth?.present?.(errCode)
      || global.OperationalErrorTruth?.resolve?.(errCode);
    return truth?.userMessageAr || fallback || errCode || 'restore_failed';
  }

  /**
   * Confirmed restore only — after user presses استعادة هذه البيانات.
   * Sync hydrate only — NOT for Backup V2 .tdw files (use confirmedBackupV2Restore).
   */
  async function confirmedCloudRestore(point, options = {}) {
    if (restoreLock) return { ok: false, error: 'restore_in_flight' };
    if (!point) return { ok: false, error: 'no_restore_point' };
    if (isBackupV2RestorePoint(point)) {
      return {
        ok: false,
        error: 'backup_v2_requires_atomic_restore',
        message: 'نسخ Backup V2 تتطلب استعادة atomic — لا تستخدم مسار Sync Hydrate.',
      };
    }
    if (!isSyncHydrateRestorePoint(point)) {
      return {
        ok: false,
        error: 'sync_hydrate_point_required',
        message: 'لا توجد بيانات Sync للفرع — استخدم استعادة Backup V2 أو انتظر المزامنة.',
      };
    }

    restoreLock = true;
    const opId = ++restoreOpId;
    const started = Date.now();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const diagnosticId = `RST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    let watchdog = null;
    const { emit, startWatchdog } = createRestoreProgressEmitter(onProgress, started, diagnosticId);

    try {
      // Preserve current DB — never wipe on start
      const preSnapshot = {
        license: !!global.LicenseCloud?.loadLocal?.(),
        deviceId: global.DeviceConfig?.load?.()?.deviceId || null,
        branchId: global.DeviceConfig?.load?.()?.lockedBranchId || null,
        centerId: getIdentity().centerId,
      };

      emit('verify_point', { lastActivity: 'تحقق من نقطة الاستعادة' });
      if (point.validation && point.validation !== 'metadata_ok' && point.validation !== 'ready') {
        return {
          ok: false,
          error: 'invalid_restore_point',
          message: 'النسخة غير صالحة للاستعادة.',
          diagnosticId,
          preserved: preSnapshot,
        };
      }

      emit('local_safety', { lastActivity: 'الاحتفاظ بالحالة المحلية الحالية' });

      watchdog = startWatchdog();

      let restoreResult = { ok: false };

      // BootFlow cloud confirm: apply Cloud V2 hydrate (metadata already shown).
      // Encrypted .tdw full-file restore requires password → file picker path.
      // Do NOT download multi‑MB .tdw here without a password / V2 restore execute.
      emit('download_db', { lastActivity: 'سحب حالة السحابة المؤكدة', stageRatio: 0.3 });
      if (global.CloudBootstrap?.hydrateFromDrive) {
        emit('staging', { lastActivity: 'دمج حالة السحابة على Staging محلي (sync hydrate)' });
        const hydrated = await global.CloudBootstrap.hydrateFromDrive(null, {
          allowMissingLicense: true,
          skipAnalysis: true,
          skipSafeAuto: false,
          markComplete: true,
          force: true,
        });
        restoreResult = {
          ok: !!hydrated?.ok || !!hydrated?.skipped,
          mode: 'cloud_hydrate',
          hydrate: hydrated,
          pointKind: point.kind,
        };
        if (hydrated?.blocked) {
          return {
            ok: false,
            error: hydrated.error || 'unsafe_data_state',
            diagnosticId,
            preserved: preSnapshot,
            detail: hydrated,
          };
        }
      } else {
        return {
          ok: false,
          error: 'restore_path_unavailable',
          diagnosticId,
          preserved: preSnapshot,
        };
      }

      emit('checksums', { stageRatio: 0.5, lastActivity: 'تحقق سلامة metadata السحابة' });
      emit('cloud_merge', { stageRatio: 0.75, lastActivity: 'دمج السحابة — لا استبدال DB' });
      emit('remote_compare', { stageRatio: 0.85 });

      // Reconciliation AFTER restore — pull newer only, never push, never during discovery
      emit('reconcile', { lastActivity: 'مواءمة ما بعد الاستعادة' });
      if (global.RestoreReconciliation?.afterRestoreDataSourceSelected) {
        await global.RestoreReconciliation.afterRestoreDataSourceSelected('cloud');
      }

      emit('restart_prep', { stageRatio: 1, lastActivity: 'جاهز لإعادة التشغيل' });

      if (opId !== restoreOpId) {
        return { ok: false, error: 'stale_restore', ignored: true, diagnosticId };
      }

      return {
        ok: restoreResult.ok !== false,
        diagnosticId,
        durationMs: Date.now() - started,
        preserved: preSnapshot,
        result: restoreResult,
        point,
      };
    } catch (err) {
      const errCode = err?.code || err?.message || String(err);
      return {
        ok: false,
        error: errCode,
        message: resolveRestoreErrorMessage(errCode, err?.message),
        diagnosticId,
        preserved: {
          license: !!global.LicenseCloud?.loadLocal?.(),
          deviceId: global.DeviceConfig?.load?.()?.deviceId || null,
          branchId: global.DeviceConfig?.load?.()?.lockedBranchId || null,
        },
      };
    } finally {
      if (watchdog) clearInterval(watchdog);
      if (opId === restoreOpId) restoreLock = false;
    }
  }

  function isBackupV2RestorePoint(point) {
    return !!(point && (
      point.kind === 'backup_v2'
      || point.kind === 'backup_file'
      || point.source === 'cloud_backup'
    ));
  }

  function isSyncHydrateRestorePoint(point) {
    return !!(point && (point.kind === 'sync_checkpoint' || point.kind === 'sync_dataset'));
  }

  /**
   * Backup V2 atomic restore from a cloud discovery point (.tdw on Drive).
   */
  async function confirmedBackupV2Restore(point, options = {}) {
    if (restoreLock) return { ok: false, error: 'restore_in_flight' };
    if (!isBackupV2RestorePoint(point)) return { ok: false, error: 'not_backup_v2_point' };

    restoreLock = true;
    const opId = ++restoreOpId;
    const started = Date.now();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const diagnosticId = `BKP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    let watchdog = null;
    const { emit, startWatchdog } = createRestoreProgressEmitter(onProgress, started, diagnosticId);

    try {
      const preSnapshot = {
        license: !!global.LicenseCloud?.loadLocal?.(),
        deviceId: global.DeviceConfig?.load?.()?.deviceId || null,
        branchId: global.DeviceConfig?.load?.()?.lockedBranchId || null,
        centerId: getIdentity().centerId,
      };

      emit('verify_point', { lastActivity: 'التحقق من نقطة Backup V2' });
      if (point.validation && point.validation !== 'metadata_ok' && point.validation !== 'ready') {
        if (point.validation === 'metadata_suspicious_small') {
          emit('verify_point', { lastActivity: 'تحذير: نسخة صغيرة جداً — قد تكون فارغة' });
        } else {
          return {
            ok: false,
            error: 'invalid_restore_point',
            message: 'النسخة غير صالحة للاستعادة.',
            diagnosticId,
            preserved: preSnapshot,
          };
        }
      }

      emit('local_safety', { lastActivity: 'الاحتفاظ بلقطة أمان محلية قبل الاستبدال' });
      try {
        await global.RestoreReconciliation?.createMandatoryPreRestoreSnapshot?.({ allowEmptySkip: true });
      } catch { /* empty */ }

      watchdog = startWatchdog();

      const api = global.cuppingElectron?.backup || global.tadawiElectron?.backup || global.tadawi?.backup;
      if (!api?.v2RestoreFromCloudRemote && !api?.v2RestoreUnified) {
        return { ok: false, error: 'backup_v2_ipc_unavailable', diagnosticId, preserved: preSnapshot };
      }

      const identity = getIdentity();
      const lic = identity.lic || global.LicenseCloud?.loadLocal?.() || null;
      const coordinatorStageMap = {
        authorization: 'download_db',
        downloading: 'download_db',
        verifying_archive: 'checksums',
        inspecting_manifest: 'checksums',
        safety_snapshot: 'local_safety',
        restoring: 'cloud_merge',
        reopening: 'cloud_merge',
        rehydrating_runtime: 'reconcile',
        verifying_data: 'reconcile',
        completed: 'restart_prep',
      };

      let progressUnsub = null;
      if (api.onRestoreProgress) {
        progressUnsub = api.onRestoreProgress((snap) => {
          const mapped = coordinatorStageMap[snap.stage] || snap.stage;
          emit(mapped, {
            lastActivity: snap.stageLabel || snap.stage,
            stageRatio: (snap.percent || 0) / 100,
            downloadProgress: snap.downloadedBytes != null ? {
              downloadedBytes: snap.downloadedBytes,
              totalBytes: snap.totalBytes,
              percent: snap.percent,
              speed: snap.speed,
              elapsedMs: snap.elapsedMs,
              etaMs: snap.etaMs,
            } : undefined,
          });
        });
      }

      emit('download_db', { lastActivity: 'تفويض استعادة Bootstrap (pre-login)', stageRatio: 0.32 });

      try { await global.DeviceCache?.syncLicenseToMainCache?.(lic); } catch { /* non-fatal */ }

      let bootstrapRestoreCapabilityId = null;
      const bootstrapApi = global.cuppingElectron?.bootstrap || global.tadawiElectron?.bootstrap;
      if (!bootstrapApi?.issueRestoreCapability) {
        if (progressUnsub) progressUnsub();
        return {
          ok: false,
          error: 'bootstrap_restore_bridge_unavailable',
          message: 'تفويض Bootstrap Restore غير متاح — حدّث التطبيق',
          diagnosticId,
          preserved: preSnapshot,
        };
      }
      const cap = await bootstrapApi.issueRestoreCapability({
        bootFlow: true,
        centerId: identity.centerId,
        organizationId: lic?.organizationId || identity.centerId,
        branchId: identity.branchId,
        remotePath: point.path || point.remotePath,
        googleFileId: point.googleFileId || point.id,
        backupId: point.backupId || point.path || point.id || point.name,
        expectedSize: point.expectedSize || point.sizeBytes,
        expectedModifiedAt: point.expectedModifiedAt || point.modifiedAt,
        licensedBranchIds: (lic?.branches || []).filter((b) => b && b.active !== false).map((b) => b.id),
        licenseSnapshot: lic,
        diagnosticId,
      });
      if (!cap?.ok) {
        if (progressUnsub) progressUnsub();
        const errCode = cap?.error || 'restore_authorization_required';
        const errTruth = global.OperationalErrorTruth?.resolve?.(errCode) || null;
        return {
          ok: false,
          error: errCode,
          message: cap?.message || errTruth?.userMessageAr || errCode,
          stage: cap?.stage || 'authorization',
          diagnosticId: cap?.diagnosticId || diagnosticId,
          detail: cap?.detail || cap?.reason || null,
          preserved: preSnapshot,
        };
      }
      bootstrapRestoreCapabilityId = cap.capabilityId;

      emit('download_db', { lastActivity: 'تنزيل ملف Backup V2 من Drive', stageRatio: 0.35 });

      const restorePayload = {
        source: 'cloud',
        context: 'bootstrap',
        remotePath: point.path || point.remotePath,
        googleFileId: point.googleFileId || point.id,
        backupId: point.backupId || point.path || point.id || point.name,
        expectedSize: point.expectedSize || point.sizeBytes,
        expectedModifiedAt: point.expectedModifiedAt || point.modifiedAt,
        relaunch: false,
        centerId: identity.centerId,
        organizationId: lic?.organizationId || identity.centerId,
        branchId: identity.branchId,
        licensedBranchIds: (lic?.branches || []).filter((b) => b && b.active !== false).map((b) => b.id),
        licenseSnapshot: lic,
        bootstrapRestoreCapabilityId,
        diagnosticId,
      };

      const restoreRes = api.v2RestoreUnified
        ? await api.v2RestoreUnified(restorePayload)
        : await api.v2RestoreFromCloudRemote({
          ...restorePayload,
          remotePath: restorePayload.remotePath,
        });

      if (progressUnsub) progressUnsub();

      if (!restoreRes?.ok) {
        const errCode = restoreRes?.error || 'backup_v2_restore_failed';
        return {
          ok: false,
          error: errCode,
          message: restoreRes?.message || resolveRestoreErrorMessage(errCode, null),
          stage: restoreRes?.stage || 'restoring',
          diagnosticId: restoreRes?.diagnosticId || diagnosticId,
          detail: restoreRes?.detail || null,
          preserved: preSnapshot,
          restore: restoreRes,
        };
      }

      emit('checksums', { stageRatio: 0.55, lastActivity: 'التحقق من manifest و scopeTruth' });
      emit('cloud_merge', { stageRatio: 0.75, lastActivity: 'استبدال SQLite عبر Backup V2 atomic pipeline' });

      try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }

      emit('reconcile', { lastActivity: 'التحقق من counts في SQLite بعد الاستعادة' });
      const verified = await global.RestoreVerification?.verifyPostRestore?.({
        kind: 'backup_v2',
        restoreKind: 'backup_v2',
        point: {
          ...point,
          manifest: restoreRes.manifest,
          scopeTruth: restoreRes.scopeTruth,
        },
        source: 'bootflow_backup_v2_cloud',
        requireOwner: false,
        requireData: false,
        sqliteRowCounts: restoreRes.rowCounts || restoreRes.restore?.rowCounts || null,
      });

      if (!verified?.verified) {
        return {
          ok: false,
          error: verified?.error || 'restore_verification_failed',
          diagnosticId,
          preserved: preSnapshot,
          verified,
          restore: restoreRes,
        };
      }

      emit('restart_prep', { stageRatio: 1, lastActivity: 'مواءمة ما بعد الاستعادة (سحب الأحدث فقط)' });
      if (global.RestoreReconciliation?.afterRestoreDataSourceSelected) {
        await global.RestoreReconciliation.afterRestoreDataSourceSelected('backup_v2');
      }

      if (opId !== restoreOpId) {
        return { ok: false, error: 'stale_restore', ignored: true, diagnosticId };
      }

      return {
        ok: true,
        mode: 'backup_v2',
        diagnosticId,
        durationMs: Date.now() - started,
        preserved: preSnapshot,
        restore: restoreRes,
        verified,
        point,
      };
    } catch (err) {
      const errCode = err?.code || err?.message || String(err);
      return {
        ok: false,
        error: errCode,
        message: resolveRestoreErrorMessage(errCode, err?.message),
        diagnosticId,
        preserved: {
          license: !!global.LicenseCloud?.loadLocal?.(),
          deviceId: global.DeviceConfig?.load?.()?.deviceId || null,
          branchId: global.DeviceConfig?.load?.()?.lockedBranchId || null,
        },
      };
    } finally {
      if (watchdog) clearInterval(watchdog);
      if (opId === restoreOpId) restoreLock = false;
    }
  }

  function cancelDiscovery() {
    discoveryOpId += 1;
    discoveryLock = false;
    try { activeAbort?.abort?.(); } catch { /* empty */ }
    activeAbort = null;
  }

  function cancelRestore() {
    restoreOpId += 1;
    restoreLock = false;
  }

  global.CloudDataDiscovery = {
    DISCOVERY_TIMEOUT_MS,
    NO_PROGRESS_WATCHDOG_MS,
    RESTORE_STAGES,
    discoverAllSources,
    confirmedCloudRestore,
    confirmedBackupV2Restore,
    isBackupV2RestorePoint,
    isSyncHydrateRestorePoint,
    runCloudScanForBackupPage,
    buildProgressState,
    buildDiscoveryProgressState,
    formatDiscoverySummaryHtml,
    formatBytes,
    formatWhen,
    cancelDiscovery,
    cancelRestore,
    getLastDiscovery: () => lastDiscovery,
    isDiscoveryLocked: () => discoveryLock,
    isRestoreLocked: () => restoreLock,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.CloudDataDiscovery;
  }
})(typeof window !== 'undefined' ? window : globalThis);
