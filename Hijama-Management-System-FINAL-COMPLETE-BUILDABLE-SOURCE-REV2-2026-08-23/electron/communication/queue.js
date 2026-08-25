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

function persistQueue() {
  if (!queuePath) return;
  try {
    fs.writeFileSync(queuePath, JSON.stringify(queue.slice(0, 5000), null, 0), 'utf8');
  } catch { /* ignore */ }
}

function enqueue(item) {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...item,
  };
  queue.push(entry);
  persistQueue();
  return entry;
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
  if (processing) return { processed: 0, reason: 'busy' };
  processing = true;
  const batch = parseInt(opts.batchSize, 10) || 5;
  const delayMs = parseInt(opts.delayMs, 10) || 400;
  let processed = 0;
  try {
    const pending = queue.filter((q) => q.status === 'pending' || (q.status === 'failed' && q.attempts < 3));
    for (const item of pending.slice(0, batch)) {
      item.attempts = (item.attempts || 0) + 1;
      item.status = 'processing';
      persistQueue();
      try {
        const result = await sendFn(item);
        item.status = result?.ok === false ? 'failed' : 'sent';
        item.result = result;
        item.processedAt = new Date().toISOString();
        if (result?.ok !== false) processed++;
        if (onStatusCallback) onStatusCallback({ type: 'queue_item', item, result });
      } catch (e) {
        item.status = 'failed';
        item.error = e.message;
      }
      persistQueue();
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  } finally {
    processing = false;
  }
  return { processed };
}

function clearQueue(status) {
  if (status) queue = queue.filter((q) => q.status !== status);
  else queue = [];
  persistQueue();
}

module.exports = {
  initQueue,
  enqueue,
  getQueueStatus,
  getQueueItems,
  processQueue,
  clearQueue,
  setStatusCallback,
};
