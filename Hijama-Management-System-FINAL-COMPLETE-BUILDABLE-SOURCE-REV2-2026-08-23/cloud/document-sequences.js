/**
 * Invoice and client-file sequence authority.
 * After restore/hydrate, counters must continue from max(stored, last used + 1)
 * so new invoices/files never collide with restored documents.
 *
 * Invoice format: TM-YYYY-NNNN → sequence is the last numeric group (NNNN),
 * not a concatenation of every digit (which would turn TM-2026-0042 into 20260042).
 * Client file format: CL-00042 → 42.
 */
(function (global) {
  'use strict';

  function lastNumericGroup(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return 0;
    const m = s.match(/(\d+)\s*$/);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : 0;
  }

  function parseInvoiceSequence(invoice) {
    return lastNumericGroup(invoice);
  }

  function parseClientFileSequence(fileNo) {
    return lastNumericGroup(fileNo);
  }

  function considerMax(current, raw, parser) {
    const n = parser(raw);
    return n > current ? n : current;
  }

  function scanMaxSequences(data) {
    const cases = Array.isArray(data && data.cases) ? data.cases : [];
    const registry = Array.isArray(data && data.clientsRegistry) ? data.clientsRegistry : [];
    const otRecords = Array.isArray(data && data.otRecords) ? data.otRecords : [];
    const invoices = Array.isArray(data && data.invoices) ? data.invoices : [];

    let maxInvoiceSeq = 0;
    let maxFileSeq = 0;

    cases.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      maxInvoiceSeq = considerMax(maxInvoiceSeq, c.invoice, parseInvoiceSequence);
      maxFileSeq = considerMax(maxFileSeq, c.fileNo, parseClientFileSequence);
    });
    registry.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      maxFileSeq = considerMax(maxFileSeq, r.fileNo, parseClientFileSequence);
    });
    otRecords.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      maxInvoiceSeq = considerMax(maxInvoiceSeq, r.invoice, parseInvoiceSequence);
    });
    invoices.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      maxInvoiceSeq = considerMax(maxInvoiceSeq, r.invoice || r.id, parseInvoiceSequence);
    });

    return { maxInvoiceSeq, maxFileSeq };
  }

  function nextCounter(stored, maxSeen) {
    const cur = Math.max(1, Number(stored) || 1);
    const needed = (Number(maxSeen) || 0) + 1;
    return Math.max(cur, needed);
  }

  function readStoredCounter(key, fallback) {
    const fromWin = Number(global[key]);
    let fromDb = NaN;
    try { fromDb = Number(global.DB && global.DB.get ? global.DB.get(key, fromWin || 1) : NaN); } catch { /* empty */ }
    const nums = [fromWin, fromDb, fallback].map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? Math.max.apply(null, nums) : 1;
  }

  function persistCounters(invoiceCounter, clientFileCounter) {
    global.invoiceCounter = invoiceCounter;
    global.clientFileCounter = clientFileCounter;
    try { if (global.DB && typeof global.DB.set === 'function') global.DB.set('invoiceCounter', invoiceCounter); } catch { /* empty */ }
    try { if (global.DB && typeof global.DB.set === 'function') global.DB.set('clientFileCounter', clientFileCounter); } catch { /* empty */ }
    try { global.BranchDataIsolation && global.BranchDataIsolation.persistActiveBranchCounters && global.BranchDataIsolation.persistActiveBranchCounters(); } catch { /* empty */ }
  }

  function collectLiveData(override) {
    if (override && typeof override === 'object') return override;
    const read = (key) => {
      if (Array.isArray(global[key])) return global[key];
      try { return (global.DB && global.DB.get && global.DB.get(key, [])) || []; } catch { return []; }
    };
    return {
      cases: read('cases'),
      clientsRegistry: read('clientsRegistry'),
      otRecords: read('otRecords'),
    };
  }

  /**
   * Lift invoice/client-file counters so the next generated number is unused.
   * Never decreases a stored counter.
   */
  function reconcileDocumentSequences(options) {
    const opts = options || {};
    const data = collectLiveData(opts.data);
    const scanned = scanMaxSequences(data);
    const storedInv = opts.invoiceCounter != null
      ? Number(opts.invoiceCounter)
      : readStoredCounter('invoiceCounter', 1);
    const storedFile = opts.clientFileCounter != null
      ? Number(opts.clientFileCounter)
      : readStoredCounter('clientFileCounter', 1);
    const invoiceCounter = nextCounter(storedInv, scanned.maxInvoiceSeq);
    const clientFileCounter = nextCounter(storedFile, scanned.maxFileSeq);
    if (opts.persist !== false) persistCounters(invoiceCounter, clientFileCounter);
    return {
      ok: true,
      invoiceCounter,
      clientFileCounter,
      maxInvoiceSeq: scanned.maxInvoiceSeq,
      maxFileSeq: scanned.maxFileSeq,
      bumpedInvoice: invoiceCounter > (Number.isFinite(storedInv) ? storedInv : 1),
      bumpedFile: clientFileCounter > (Number.isFinite(storedFile) ? storedFile : 1),
    };
  }

  const api = {
    parseInvoiceSequence,
    parseClientFileSequence,
    scanMaxSequences,
    nextCounter,
    reconcileDocumentSequences,
  };

  global.DocumentSequences = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
