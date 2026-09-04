#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const Slot = require(path.join(root, 'cloud/wa-send-slot.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gatewaySrc = fs.readFileSync(path.join(root, 'electron/communication/gateway.js'), 'utf8');
const workspaceSrc = fs.readFileSync(path.join(root, 'electron/whatsapp-workspace.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');

const deeplink = Slot.launchStrategy({ apiReady: false, electron: true, delayMs: 400 });
check(deeplink.kind === 'single-slot', 'Electron without API uses a single send slot');
check(deeplink.maxOpen === 1, 'deeplink strategy never opens more than one window');
check(deeplink.delayMs >= 2000, 'deeplink delay is floored so chats are not fired in a burst');
check(Slot.windowsForBatch(1000, deeplink) === 1, '1000 automated messages still use 1 window');
check(Slot.windowsForBatch(50000, deeplink) === 1, '50k promo recipients still use 1 window');
check(Slot.canOpenAnother(1, 1) === false, 'a live slot blocks a second window');
check(Slot.nextDelayMs(0, 2500) === 0 && Slot.nextDelayMs(1, 2500) === 2500, 'first item is immediate, later items wait');

const apiPlan = Slot.launchStrategy({ apiReady: true, delayMs: 400 });
check(apiPlan.kind === 'api' && Slot.windowsForBatch(50000, apiPlan) === 0, 'API bulk opens zero browser tabs');

const jobs = Slot.dedupeJobs([
  { refId: 'a', phone: '1' },
  { refId: 'a', phone: '1' },
  { refId: 'b', phone: '2' },
]);
check(jobs.length === 2, 'duplicate refIds are not queued twice');
check(Slot.confirmNeeded(21) && !Slot.confirmNeeded(20), 'large batches ask before starting');
check(Slot.confirmMessage(1000, 2000).indexOf('نافذة واتساب واحدة') >= 0, 'confirm copy says one WhatsApp window');

function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = src.match(re);
  if (!m) return '';
  let depth = 0;
  for (let j = m.index + m[0].length - 1; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  return '';
}

const autoFn = extractFn(indexSrc, 'runMessagingAutomation');
const bulkFn = extractFn(indexSrc, 'sendBulkWA');
const bridgeChunk = indexSrc.slice(indexSrc.indexOf('const MessagingBridge'), indexSrc.indexOf('function getReceiptCase'));

check(autoFn && /dispatchMessagingJobs/.test(autoFn), 'automation dispatches through the shared job queue');
check(/enqueueApiMessagingBatch/.test(indexSrc) && /drainQueue/.test(indexSrc), 'API automations enqueue then drain in the background');
check(/needs_api/.test(indexSrc), 'large no-API batches are refused instead of opening windows');
check(autoFn && !/window\.open/.test(autoFn), 'automation function itself does not open tabs');
check(bulkFn && /dispatchMessagingJobs/.test(bulkFn), 'bulk send uses the single-slot queue');
check(bulkFn && !/window\.open/.test(bulkFn), 'bulk send does not open a tab per client');
check(/enqueueWhatsAppSlotJobs/.test(indexSrc) && /processWhatsAppSendSlot/.test(indexSrc), 'renderer keeps a sequential WhatsApp slot processor');
check(/class="wa-slot-bar"/.test(indexSrc), 'queue progress bar is visible on messaging pages');
check(bridgeChunk && /openSendSlot/.test(bridgeChunk), 'MessagingBridge launches WhatsApp through the reused slot');
check(bridgeChunk && !/window\.open\(launchUrl, '_blank'\)/.test(bridgeChunk), 'bridge no longer opens _blank for WhatsApp');
check(/function openSendSlot/.test(workspaceSrc), 'Electron reuses one WhatsApp BrowserWindow');
check(preloadSrc.indexOf("whatsapp:openSendSlot") >= 0, 'preload allows openSendSlot IPC');
check(/openSendSlot/.test(gatewaySrc), 'gateway deeplinks go through the reused slot');
check(!/await shell\.openExternal\(launchUrl\)/.test(gatewaySrc), 'gateway does not open a fresh OS tab per WhatsApp deeplink');

if (errors.length) {
  console.error('FAIL whatsapp-single-slot-send');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:whatsapp-single-slot-send');
