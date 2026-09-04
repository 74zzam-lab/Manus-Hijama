/**
 * Single-slot WhatsApp launch plan.
 * Deeplink/browser sends must never open one tab per recipient.
 */
(function (global) {
  'use strict';

  const WINDOW_NAME = 'tdw-whatsapp-send';
  const MAX_OPEN = 1;
  const MIN_DEEPLINK_DELAY_MS = 2000;
  const CONFIRM_ABOVE = 20;

  function toInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function launchStrategy(opts) {
    const src = opts && typeof opts === 'object' ? opts : {};
    const delayIn = toInt(src.delayMs, 0);
    if (src.apiReady) {
      return {
        kind: 'api',
        maxOpen: MAX_OPEN,
        delayMs: Math.max(400, delayIn || 400),
        windowName: '',
      };
    }
    return {
      kind: src.electron ? 'single-slot' : 'named-window',
      maxOpen: MAX_OPEN,
      delayMs: Math.max(MIN_DEEPLINK_DELAY_MS, delayIn || MIN_DEEPLINK_DELAY_MS),
      windowName: WINDOW_NAME,
    };
  }

  function canOpenAnother(activeOpens, maxOpen) {
    const active = Math.max(0, toInt(activeOpens, 0));
    const cap = Math.max(1, toInt(maxOpen, MAX_OPEN));
    return active < cap;
  }

  function nextDelayMs(index, delayMs) {
    if (toInt(index, 0) <= 0) return 0;
    return Math.max(0, toInt(delayMs, MIN_DEEPLINK_DELAY_MS));
  }

  function windowsForBatch(count, strategy) {
    const n = Math.max(0, toInt(count, 0));
    if (!n) return 0;
    if (strategy && strategy.kind === 'api') return 0;
    return MAX_OPEN;
  }

  function confirmNeeded(count) {
    return toInt(count, 0) > CONFIRM_ABOVE;
  }

  function estimateMinutes(count, delayMs) {
    const n = Math.max(0, toInt(count, 0));
    const d = Math.max(0, toInt(delayMs, MIN_DEEPLINK_DELAY_MS));
    if (!n) return 0;
    return Math.max(1, Math.ceil((n * d) / 60000));
  }

  function dedupeJobs(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    const out = [];
    const seen = new Set();
    list.forEach(function (job) {
      if (!job || typeof job !== 'object') return;
      const key = String(job.refId || '') || (String(job.phone || '') + '|' + String(job.type || ''));
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(job);
    });
    return out;
  }

  function confirmMessage(count, delayMs) {
    const n = toInt(count, 0);
    const minutes = estimateMinutes(n, delayMs);
    return 'سيتم تجهيز ' + n + ' رسالة وإرسالها واحداً تلو الآخر في نافذة واتساب واحدة.\n'
      + 'لن يفتح المتصفح تبويباً لكل عميل.\n'
      + 'بدون واتساب Business API كل محادثة تحتاج تأكيد الإرسال داخل واتساب.\n'
      + 'مدة تقريبية: حوالي ' + minutes + ' دقيقة.\n\nمتابعة؟';
  }

  const api = {
    WINDOW_NAME: WINDOW_NAME,
    MAX_OPEN: MAX_OPEN,
    MIN_DEEPLINK_DELAY_MS: MIN_DEEPLINK_DELAY_MS,
    CONFIRM_ABOVE: CONFIRM_ABOVE,
    launchStrategy: launchStrategy,
    canOpenAnother: canOpenAnother,
    nextDelayMs: nextDelayMs,
    windowsForBatch: windowsForBatch,
    confirmNeeded: confirmNeeded,
    estimateMinutes: estimateMinutes,
    dedupeJobs: dedupeJobs,
    confirmMessage: confirmMessage,
  };
  global.WaSendSlot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
