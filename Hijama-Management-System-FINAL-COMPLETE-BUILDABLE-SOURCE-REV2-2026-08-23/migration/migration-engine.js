/**
 * Production Data Migration Engine — orchestrates client + visit import.
 * Integrates with existing ensureClientRegistry, buildImportCase, DB persistence.
 */
(function (global) {
  'use strict';

  const MF = global.MigrationFields || {};
  const MI = global.MigrationIdentity || {};
  const MC = global.MigrationClient || {};
  const MV = global.MigrationVisit || {};
  const MB = global.MigrationBulk || {};

  function emptyStats() {
    return {
      total: 0, valid: 0, newClients: 0, updatedClients: 0, mergedClients: 0, skipped: 0,
      confirmedMatches: 0, possibleMatches: 0,
      newVisits: 0, updatedVisits: 0, stubVisits: 0, duplicateVisits: 0,
      errors: [], warnings: [], preview: [], skipReasons: {}
    };
  }

  function resolveStrategy(opts) {
    return opts?.duplicateStrategy || opts?.strategy || 'skip';
  }

  function shouldSkipRow(match, strategy) {
    if (match.level === MF.MATCH_LEVEL?.NEW || match.level === 'new') return false;
    if (strategy === 'import_all') return false;
    if (strategy === 'skip') return true;
    return false;
  }

  function analyzeMigration(records, opts, indexes) {
    const stats = emptyStats();
    stats.total = records.length;
    const strategy = resolveStrategy(opts);
    const sessionSeen = new Set();

    records.forEach((rec, i) => {
      if (!rec.name || !MI.normPhone(rec.phone) || MI.normPhone(rec.phone).length < 9) {
        stats.skipped++;
        stats.skipReasons['بيانات ناقصة'] = (stats.skipReasons['بيانات ناقصة'] || 0) + 1;
        stats.errors.push({ i, name: rec.name || '—', reason: 'اسم أو جوال غير صالح' });
        return;
      }
      const h = MI.visitFingerprint ? MI.visitFingerprint(rec) : `${rec.phone}|${rec.name}|${rec.date || ''}`;
      if (sessionSeen.has(h) && strategy !== 'import_all') {
        stats.skipped++;
        stats.skipReasons['مكرر في الملف'] = (stats.skipReasons['مكرر في الملف'] || 0) + 1;
        return;
      }
      sessionSeen.add(h);

      const match = MI.matchClient(rec, indexes);
      if (match.level === 'confirmed') stats.confirmedMatches++;
      else if (match.level === 'possible') stats.possibleMatches++;

      if (shouldSkipRow(match, strategy)) {
        stats.skipped++;
        stats.skipReasons['موجود مسبقاً'] = (stats.skipReasons['موجود مسبقاً'] || 0) + 1;
        return;
      }

      if (match.client) {
        if (strategy === 'merge') stats.mergedClients++;
        else stats.updatedClients++;
      } else stats.newClients++;

      const hasVisit = MV.hasVisitData(rec, opts?.mapping);
      if (hasVisit) {
        const vm = MI.matchVisit(rec, indexes);
        if (vm.exists) stats.updatedVisits++;
        else stats.newVisits++;
      } else {
        stats.stubVisits++;
      }

      stats.valid++;
      if (stats.preview.length < 10) {
        stats.preview.push(Object.assign({}, rec, { _match: match.level, _reasons: match.reasons.join(', ') }));
      }
    });
    return stats;
  }

  function resolveOrCreateClient(rec, match, strategy, mapping, indexes, ctx) {
    let client = match.client;
    const forceNew = strategy === 'import_all' && match.client;

    if (!client || forceNew) {
      if (typeof global.ensureClientRegistry !== 'function') return null;
      client = global.ensureClientRegistry({
        name: rec.name,
        phone: rec.phone,
        patientId: MC.isMapped(mapping, 'patientId') ? rec.patientId : '',
        nationality: MC.isMapped(mapping, 'nationality') ? rec.nationality : '',
        fileNo: MC.isMapped(mapping, 'fileNo') ? rec.fileNo : undefined,
        forceNew: !!forceNew,
        deferPersist: !!ctx.deferPersist
      });
      if (client) MC.registerClientInIndexes(client, indexes);
    } else if (strategy !== 'skip') {
      MC.mergeClientRecord(client, rec, strategy, mapping);
    }

    if (client) {
      MC.ensureClientStructure(client, rec, mapping);
      if (MB.shouldApplyBulk(ctx.bulk, client._migrationRowKind || (match.client ? 'updated' : 'new'))) {
        MB.applyBulkToClient(client, ctx.bulk, ctx.doctors);
      }
    }
    return client;
  }

  function createOrUpdateVisit(rec, client, strategy, mapping, indexes, ctx) {
    const hasVisit = MV.hasVisitData(rec, mapping);
    const buildCase = ctx.buildImportCase || global.buildImportCase;
    if (typeof buildCase !== 'function') return { action: 'none' };

    let caseRec;
    if (hasVisit) {
      const vm = MI.matchVisit(rec, indexes);
      const existing = MV.findCaseByFingerprint(rec, ctx.cases, client);
      if (existing && strategy !== 'import_all') {
        MV.mergeCaseFields(existing, {
          name: rec.name, phone: rec.phone, patientId: rec.patientId, nationality: rec.nationality,
          doctorName: rec.doctor, serviceType: rec.service || rec.serviceType, cups: rec.cups,
          total: rec.total, cash: rec.cash, card: rec.card, notes: rec.notes, sessionNo: rec.sessionNo
        }, strategy === 'update' ? 'fill_empty' : strategy);
        existing.importUpdated = true;
        return { action: 'updated', caseRec: existing };
      }
      caseRec = buildCase(rec, client, { mapping, isStub: !hasVisit });
      if (rec.service && MC.isMapped(mapping, 'service')) caseRec.serviceType = rec.service;
      if (rec.sessionNo && MC.isMapped(mapping, 'sessionNo')) caseRec.sessionNo = rec.sessionNo;
    } else {
      const stubRec = Object.assign({}, rec, MV.buildStubVisitMeta(rec));
      caseRec = buildCase(stubRec, client, { mapping, isStub: true });
      if (!MC.isMapped(mapping, 'date')) {
        caseRec.date = new Date().toISOString().slice(0, 10);
      }
    }

    if (MB.shouldApplyBulk(ctx.bulk, ctx.rowKind)) MB.applyBulkToCase(caseRec, ctx.bulk, ctx.doctors);

    ctx.cases.push(caseRec);
    indexes.visitFingerprints.add(MI.visitFingerprint(rec));
    indexes.caseKeys.add(`${MI.normPhone(rec.phone)}|${MI.normName(rec.name).toLowerCase()}|${caseRec.date || ''}`);
    return { action: hasVisit ? 'created' : 'stub', caseRec };
  }

  function processMigrationRow(rec, opts, ctx) {
    const strategy = resolveStrategy(opts);
    const mapping = opts?.mapping || {};
    const indexes = ctx.indexes;
    const match = MI.matchClient(rec, indexes);

    if (shouldSkipRow(match, strategy)) {
      ctx.skipped++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'تجاهل', reason: 'موجود — ' + (match.reasons.join(', ') || strategy) });
      return { skipped: true };
    }

    if (match.level === 'possible' && strategy === 'skip') {
      ctx.skipped++;
      ctx.warnings.push({ row: ctx.rowNum, name: rec.name, reason: 'تطابق محتمل — تم التخطي' });
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'تجاهل', reason: 'تطابق محتمل' });
      return { skipped: true };
    }

    ctx.rowKind = match.client ? (strategy === 'merge' ? 'merged' : 'updated') : 'new';
    const client = resolveOrCreateClient(rec, match, strategy, mapping, indexes, ctx);
    if (!client) {
      ctx.skipped++;
      ctx.errors.push({ row: ctx.rowNum, name: rec.name, reason: 'تعذّر إنشاء العميل' });
      return { skipped: true, error: true };
    }

    const visitResult = createOrUpdateVisit(rec, client, strategy, mapping, indexes, ctx);

    if (visitResult.action === 'created') {
      ctx.imported++;
      ctx.newVisits++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'جديد', reason: visitResult.caseRec?.invoice || 'زيارة + عميل' });
    } else if (visitResult.action === 'stub') {
      ctx.imported++;
      ctx.stubVisits++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'ملف + زيارة', reason: MV.STUB_NOTE });
    } else if (visitResult.action === 'updated') {
      ctx.updated++;
      ctx.updatedVisits++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'تحديث', reason: visitResult.caseRec?.invoice || 'زيارة محدّثة' });
    } else if (!match.client) {
      ctx.imported++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'جديد', reason: 'ملف عميل' });
    } else {
      ctx.updated++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'تحديث', reason: 'بيانات عميل' });
    }

    if (typeof global.logAudit === 'function' && visitResult.caseRec) {
      global.logAudit('CASE_CREATED', `ترحيل: ${rec.name} — ${visitResult.caseRec.invoice}`, {
        patient: rec.name, invoice: visitResult.caseRec.invoice, imported: true, migration: true, deferPersist: !!ctx.deferPersist
      });
    }

    return { client, visit: visitResult.caseRec, match: match.level };
  }

  function formatMemoryMb() {
    if (typeof performance !== 'undefined' && performance.memory?.usedJSHeapSize) {
      return (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB';
    }
    return '—';
  }

  global.MigrationEngine = {
    emptyStats, analyzeMigration, processMigrationRow, resolveStrategy, formatMemoryMb,
    getFields: () => MF.MIGRATION_FIELDS || {},
    getStrategies: () => MF.DUPLICATE_STRATEGIES || {}
  };
})(typeof window !== 'undefined' ? window : globalThis);
