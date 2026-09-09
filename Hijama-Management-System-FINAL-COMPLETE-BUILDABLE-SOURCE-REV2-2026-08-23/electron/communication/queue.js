const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let queue = [];
let queuePath = null;
let processing = false;
let onStatusCallback = null;

function initQueue() {
  try {
    queuePath = path.join(app.getPath('userData'), 'communication-queue.json');
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) || [];
    }
  } catch {
    queue = [];
  }
}

const QUEUE_CAP = 50000;

function pendingCount() {
  return queue.filter((q) => q.status === 'pending').length;
}

function persistQueue() {
  if (!queuePath) return;
  try {
    const compact = queue.slice(-QUEUE_CAP).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const copy = { ...item };
      if (copy.message) copy.message = String(copy.message).slice(0, 4000);
      if (copy.result && copy.status === 'sent') copy.result = { ok: true, mode: 'api' };
      delete copy.media;
      return copy;
    });
    fs.writeFileSync(queuePath, JSON.stringify(compact), 'utf8');
    queue = compact;
  } catch { /* ignore */ }
}

function enqueue(item) {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    attempts: 0,
    phone: String(item.phone || '').slice(0, 40),
    message: String(item.message || '').slice(0, 4000),
    channel: item.channel || 'whatsapp',
    type: String(item.type || '').slice(0, 40),
    refId: String(item.refId || '').slice(0, 80),
    providerId: item.providerId || '',
    slug: item.slug || '',
    clientName: String(item.clientName || '').slice(0, 80),
  };
  queue.push(entry);
  persistQueue();
  return entry;
}

function enqueueMany(items) {
  const list = Array.isArray(items) ? items : [];
  const added = [];
  list.forEach((item) => {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${added.length}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0,
      phone: String(item.phone || '').slice(0, 40),
      message: String(item.message || '').slice(0, 4000),
      channel: item.channel || 'whatsapp',
      type: String(item.type || '').slice(0, 40),
      refId: String(item.refId || '').slice(0, 80),
      providerId: item.providerId || '',
      slug: item.slug || '',
      clientName: String(item.clientName || '').slice(0, 80),
    };
    queue.push(entry);
    added.push({ id: entry.id, refId: entry.refId });
  });
  persistQueue();
  const keptIds = new Set(queue.map((q) => q.id));
  const queued = added.filter((a) => keptIds.has(a.id)).length;
  return {
    ok: true,
    queued,
    dropped: Math.max(0, added.length - queued),
  };
}

function getQueueStatus() {
  const pending = queue.filter((q) => q.status === 'pending').length;
  const failed = queue.filter((q) => q.status === 'failed').length;
  const sent = queue.filter((q) => q.status === 'sent').length;
  return { pending, failed, sent, total: queue.length, processing };
}

function getQueueItems(limit = 50) {
  return queue.slice(-limit).reverse();
}

function setStatusCallback(fn) {
  onStatusCallback = fn;
}

async function processQueue(sendFn, opts = {}) {
  if (processing) return { processed: 0, attempted: 0, failed: 0, remaining: pendingCount(), reason: 'busy' };
  processing = true;
  const batch = parseInt(opts.batchSize, 10) || 5;
  const delayMs = parseInt(opts.delayMs, 10) || 400;
  const retryFailed = opts.retryFailed !== false;
  let processed = 0;
  let attempted = 0;
  let failed = 0;
  try {
    const pending = queue.filter((q) =>
      q.status === 'pending' || (retryFailed && q.status === 'failed' && (q.attempts || 0) < 3)
    );
    for (const item of pending.slice(0, batch)) {
      item.attempts = (item.attempts || 0) + 1;
      item.status = 'processing';
      persistQueue();
      attempted++;
      try {
        const result = await sendFn(item);
        const fatal = result?.reason === 'no_api_provider' || result?.reason === 'no_phone';
        if (result?.ok === false) {
          item.status = 'failed';
          item.error = result.error || result.reason || 'send_failed';
          if (fatal) item.attempts = 99;
          failed++;
        } else {
          item.status = 'sent';
          item.error = '';
          processed++;
        }
        item.result = result && result.ok ? { ok: true, mode: result.mode || 'api' } : result;
        item.processedAt = new Date().toISOString();
        if (onStatusCallback) onStatusCallback({ type: 'queue_item', item, result });
      } catch (e) {
        item.status = 'failed';
        item.error = e.message;
        failed++;
      }
      persistQueue();
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  } finally {
    processing = false;
  }
  return { processed, attempted, failed, remaining: pendingCount() };
}

function clearQueue(status) {
  if (status) queue = queue.filter((q) => q.status !== status);
  else queue = [];
  persistQueue();
}

module.exports = {
  initQueue,
  enqueue,
  enqueueMany,
  getQueueStatus,
  getQueueItems,
  processQueue,
  clearQueue,
  setStatusCallback,
  QUEUE_CAP,
};
