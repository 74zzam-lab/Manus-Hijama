'use strict';

/**
 * V2-5.5 — performance measurement helpers (median-of-3, host docs, claim gate).
 */

const os = require('os');

function documentHost() {
  const cpus = os.cpus() || [];
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    node: process.version,
    cpus: cpus.length,
    cpuModel: cpus[0] ? cpus[0].model : null,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
    hostname: os.hostname(),
  };
}

function median(nums) {
  const arr = (nums || []).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function nowMs() {
  const [s, ns] = process.hrtime();
  return s * 1e3 + ns / 1e6;
}

/**
 * Run fn three times; return samples + median ms.
 * fn may be sync or return a Promise.
 */
async function runMedianOf3(label, asyncOrSyncFn) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t0 = nowMs();
    const result = asyncOrSyncFn(i);
    if (result && typeof result.then === 'function') await result;
    runs.push(Math.round((nowMs() - t0) * 1000) / 1000);
  }
  return { label, runs, medianMs: median(runs) };
}

/**
 * Reject narrative performance claims that lack numeric measurement evidence.
 * @param {string} claim
 * @param {{ medianMs?: number, runs?: number[], ms?: number, value?: number }|number|null} measurement
 */
function assertNoClaimWithoutMeasurement(claim, measurement) {
  const text = String(claim || '').trim();
  if (!text) throw new Error('empty_claim');
  let ok = false;
  if (typeof measurement === 'number' && Number.isFinite(measurement)) ok = true;
  else if (measurement && typeof measurement === 'object') {
    if (Number.isFinite(measurement.medianMs)) ok = true;
    if (Number.isFinite(measurement.ms)) ok = true;
    if (Number.isFinite(measurement.value)) ok = true;
    if (Array.isArray(measurement.runs) && measurement.runs.some((n) => Number.isFinite(n))) ok = true;
  }
  if (!ok) {
    throw new Error(`claim_without_measurement: ${text.slice(0, 120)}`);
  }
  return { ok: true, claim: text, measurement };
}

const api = {
  documentHost,
  median,
  runMedianOf3,
  assertNoClaimWithoutMeasurement,
};

module.exports = api;
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.TadawiPerfHarness = api;
  }
} catch { /* ignore */ }
