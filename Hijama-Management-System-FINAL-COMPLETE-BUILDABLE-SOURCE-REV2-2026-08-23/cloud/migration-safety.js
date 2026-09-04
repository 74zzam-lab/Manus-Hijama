/**
 * Migration safety — renderer helpers for truthful migration reports.
 */
(function (global) {
  'use strict';

  function enrichMigrationReport(report) {
    if (!report) return report;
    const Truth = global.OperationalErrorTruth;
    if (!Truth?.enrichResult) return report;
    if (report.ok) return report;
    const enriched = Truth.enrichResult(report);
    if (report.rollbackApplied && enriched.userMessageAr) {
      enriched.userMessageAr += ' — تمت استعادة النسخة الاحتياطية قبل الترحيل.';
    }
    return enriched;
  }

  function notifyMigrationFailure(report, options) {
    options = options || {};
    const enriched = enrichMigrationReport(report);
    const Truth = global.OperationalErrorTruth;
    if (Truth?.notifyTruthful) {
      Truth.notifyTruthful(enriched, { toast: options.toast !== false });
    } else if (options.toast && enriched.userMessageAr) {
      try {
        global.showToast?.(enriched.userMessageAr, 'error');
      } catch {
        /* ignore */
      }
    }
    return enriched;
  }

  global.MigrationSafety = {
    enrichMigrationReport,
    notifyMigrationFailure,
  };
})(typeof window !== 'undefined' ? window : globalThis);
