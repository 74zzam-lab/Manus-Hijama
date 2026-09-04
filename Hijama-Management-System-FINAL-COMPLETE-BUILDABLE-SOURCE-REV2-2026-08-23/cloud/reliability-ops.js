'use strict';

/**
 * V2-5.5 — crash markers, log rotation, resource classifiers, soak harness.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPS = ['backup', 'sync', 'restore'];

function markerPath(dir, op) {
  return path.join(dir, `.crash-in-progress-${op}`);
}

function beginOp(dir, op, meta) {
  if (!OPS.includes(op)) throw new Error('unknown_op:' + op);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    op,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    meta: meta || {},
  };
  fs.writeFileSync(markerPath(dir, op), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function endOp(dir, op) {
  const p = markerPath(dir, op);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { ok: true, op, cleared: true };
}

function detectIncompleteOps(dir) {
  const found = [];
  for (const op of OPS) {
    const p = markerPath(dir, op);
    if (fs.existsSync(p)) {
      let body = null;
      try { body = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { body = { raw: true }; }
      found.push({ op, path: p, body });
    }
  }
  return { ok: found.length === 0, incomplete: found };
}

function recoverIncompleteOps(dir) {
  const before = detectIncompleteOps(dir);
  for (const row of before.incomplete) {
    try { fs.unlinkSync(row.path); } catch { /* ignore */ }
  }
  return {
    ok: true,
    recovered: before.incomplete.map((r) => r.op),
    after: detectIncompleteOps(dir),
  };
}

/**
 * Rotate a log file when size exceeds maxBytes; keep maxFiles rotated copies.
 */
function rotateLogIfNeeded(logPath, options) {
  options = options || {};
  const maxBytes = Number(options.maxBytes) || 256 * 1024;
  const maxFiles = Math.max(1, Number(options.maxFiles) || 3);
  if (!fs.existsSync(logPath)) {
    return { ok: true, rotated: false, reason: 'missing' };
  }
  const st = fs.statSync(logPath);
  if (st.size <= maxBytes) {
    return { ok: true, rotated: false, size: st.size, maxBytes };
  }
  for (let i = maxFiles - 1; i >= 1; i--) {
    const src = `${logPath}.${i}`;
    const dest = `${logPath}.${i + 1}`;
    if (fs.existsSync(src)) {
      try { fs.renameSync(src, dest); } catch { /* ignore */ }
    }
  }
  fs.renameSync(logPath, `${logPath}.1`);
  fs.writeFileSync(logPath, '');
  return { ok: true, rotated: true, previousSize: st.size, maxBytes, maxFiles };
}

function classifyDiskError(err) {
  const msg = String((err && (err.message || err.code)) || err || '').toLowerCase();
  const code = String((err && err.code) || '');
  const diskFull =
    code === 'ENOSPC' ||
    /no space|enospc|disk full|edquota|diskquota/i.test(msg);
  return {
    kind: diskFull ? 'disk_full' : 'other',
    diskFull,
    code: code || null,
    message: String((err && err.message) || err || '').slice(0, 240),
    action: diskFull ? 'stop_write_preserve_db_surface_error' : 'propagate',
  };
}

function classifyMemoryPressure(options) {
  options = options || {};
  const total = os.totalmem();
  const free = os.freemem();
  const usedRatio = 1 - free / total;
  const heap = process.memoryUsage();
  const threshold = Number(options.usedRatioThreshold) || 0.92;
  const heapThresholdMb = Number(options.heapThresholdMb) || 512;
  const heapMb = heap.heapUsed / (1024 * 1024);
  const low =
    options.forceLow === true ||
    usedRatio >= threshold ||
    heapMb >= heapThresholdMb;
  return {
    kind: low ? 'low_memory' : 'ok',
    lowMemory: low,
    usedRatio: Math.round(usedRatio * 1000) / 1000,
    freeMb: Math.round(free / (1024 * 1024)),
    totalMb: Math.round(total / (1024 * 1024)),
    heapUsedMb: Math.round(heapMb),
    action: low ? 'defer_bulk_work_gc_hint' : 'continue',
  };
}

/**
 * Soak / idle harness. Duration via options.ms or SOAK_MS / SOAK_HOURS env.
 * Default short (CI). SOAK_HOURS=8 for UAT-255-002 full soak.
 */
async function runSoak(options) {
  options = options || {};
  const hours = Number(process.env.SOAK_HOURS || options.hours || 0);
  const ms = Number(
    options.ms != null
      ? options.ms
      : process.env.SOAK_MS != null
        ? process.env.SOAK_MS
        : hours > 0
          ? hours * 3600 * 1000
          : 50
  );
  const tickMs = Math.max(10, Number(options.tickMs) || Math.min(1000, Math.floor(ms / 5) || 10));
  const work = typeof options.work === 'function' ? options.work : () => {};
  const started = Date.now();
  const mem0 = process.memoryUsage().heapUsed;
  let ticks = 0;
  let cpuBusyMs = 0;
  while (Date.now() - started < ms) {
    const t0 = Date.now();
    await Promise.resolve(work(ticks));
    cpuBusyMs += Date.now() - t0;
    ticks += 1;
    const remain = ms - (Date.now() - started);
    if (remain > 0) {
      await new Promise((r) => setTimeout(r, Math.min(tickMs, remain)));
    }
  }
  const elapsed = Date.now() - started;
  const mem1 = process.memoryUsage().heapUsed;
  const idleRatio = 1 - cpuBusyMs / Math.max(1, elapsed);
  return {
    ok: true,
    ms: elapsed,
    configuredMs: ms,
    hoursMode: hours || null,
    ticks,
    heapDeltaMb: Math.round(((mem1 - mem0) / (1024 * 1024)) * 1000) / 1000,
    heapStartMb: Math.round(mem0 / (1024 * 1024)),
    heapEndMb: Math.round(mem1 / (1024 * 1024)),
    cpuBusyMs,
    idleRatio: Math.round(idleRatio * 1000) / 1000,
    leakSuspect: mem1 - mem0 > 64 * 1024 * 1024,
  };
}

/**
 * Prove retry backoff is not a tight loop: successive setError delays grow.
 */
function proveRetryBackoff(syncStateApi) {
  const api = syncStateApi || (typeof globalThis !== 'undefined' ? globalThis.SyncState : null);
  if (!api || typeof api.setError !== 'function') {
    throw new Error('sync_state_missing');
  }
  api.clearError();
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const s = api.setError('probe_fail');
    samples.push(Number(s.retryBackoffMs) || 0);
  }
  let growing = true;
  for (let i = 1; i < samples.length; i++) {
    if (!(samples[i] >= samples[i - 1])) growing = false;
  }
  const minGap = samples[0];
  return {
    ok: growing && minGap >= 4000 && samples[samples.length - 1] <= 300000,
    samples,
    tightLoop: !growing || minGap < 1000,
    policy: 'exponential_backoff_4s_to_300s',
  };
}

module.exports = {
  OPS,
  beginOp,
  endOp,
  detectIncompleteOps,
  recoverIncompleteOps,
  rotateLogIfNeeded,
  classifyDiskError,
  classifyMemoryPressure,
  runSoak,
  proveRetryBackoff,
  markerPath,
};
