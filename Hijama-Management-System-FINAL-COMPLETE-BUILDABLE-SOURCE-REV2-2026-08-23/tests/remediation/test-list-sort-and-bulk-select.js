#!/usr/bin/env node
'use strict';

/**
 * List sort (newest-first + user-controlled), full-list bulk select,
 * client-message media attachments, and live-sync timing constants.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const ListSort = require(path.join(root, 'cloud/list-sort.js'));
const BulkSelect = require(path.join(root, 'cloud/bulk-select.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engineSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
const gatewaySrc = fs.readFileSync(path.join(root, 'electron/communication/gateway.js'), 'utf8');
const invoicesSrc = fs.readFileSync(path.join(root, 'cupping-invoices-page.js'), 'utf8');

check(ListSort.DEFAULTS.clients === 'lastVisit-desc', 'clients default newest last-visit');
check(ListSort.DEFAULTS.daily === 'created-desc', 'daily default newest session registration');
check(ListSort.DEFAULTS.invoices === 'date-desc', 'invoices default newest date');
check(ListSort.DEFAULTS.messages === 'lastVisit-desc', 'messages default newest last-visit');
check(ListSort.DEFAULTS.messageLog === 'sentAt-desc', 'message log default newest send time');

const clients = [
  { name: 'قديم', lastDate: '2026-01-01', fileNo: 'CL-00001', visits: [1], latestCreatedAt: '2026-01-01T08:00:00.000Z' },
  { name: 'جديد', lastDate: '2026-08-20', fileNo: 'CL-00040', visits: [1, 2, 3], latestCreatedAt: '2026-08-20T10:00:00.000Z' },
  { name: 'أوسط', lastDate: '2026-06-01', fileNo: 'CL-00012', visits: [1, 2], latestCreatedAt: '2026-06-01T09:00:00.000Z' },
];
const byVisit = ListSort.sortItems(clients, 'lastVisit-desc', (c, field) => {
  if (field === 'lastVisit') return c.lastDate;
  if (field === 'created') return ListSort.timeValue(c.latestCreatedAt);
  return c.lastDate;
});
check(byVisit[0].name === 'جديد' && byVisit[2].name === 'قديم', 'lastVisit-desc puts newest client first');

const byFile = ListSort.sortItems(clients, 'fileNo-asc', (c, field) => (
  field === 'fileNo' ? ListSort.fileNoValue(c.fileNo) : c.name
));
check(byFile[0].fileNo === 'CL-00001' && byFile[2].fileNo === 'CL-00040', 'fileNo-asc uses last numeric group');

const sessions = [
  { invoice: 'TM-2026-0001', createdAt: '2026-08-28T08:00:00.000Z', date: '2026-08-28' },
  { invoice: 'TM-2026-0003', createdAt: '2026-08-28T11:00:00.000Z', date: '2026-08-28' },
  { invoice: 'TM-2026-0002', createdAt: '2026-08-28T09:30:00.000Z', date: '2026-08-28' },
];
const byCreated = ListSort.sortItems(sessions, 'created-desc', (c, field) => (
  field === 'created' ? ListSort.timeValue(c.createdAt) : c.invoice
));
check(byCreated[0].invoice === 'TM-2026-0003', 'session registration newest-first');

const sel = BulkSelect.createSelection();
const allRows = [
  { phone: '0500000001', name: 'A' },
  { phone: '050-000-0002', name: 'B' },
  { phone: '0500000003', name: 'C' },
];
sel.addAll(allRows);
check(sel.size() === 3, 'select-all clients uses full filtered set');
check(sel.has('0500000002'), 'phone digits are normalized for selection');
sel.clear();
sel.add(allRows[0]);
const page = sel.pageState(allRows);
check(page.some === true && page.all === false, 'header checkbox stays page-partial when only some selected');

check(/function selectAllBulkClients/.test(indexSrc), 'select-all-clients function exists');
check(/function selectPageBulk/.test(indexSrc), 'select-page function exists');
check(/تحديد كل العملاء/.test(indexSrc), 'UI has select-all-clients action');
check(/تحديد الصفحة/.test(indexSrc), 'UI keeps page-only select');
check(/bulkSelection\.values\(\)/.test(indexSrc), 'bulk send uses persisted selection set, not DOM page only');
check(/id="sort-clients"/.test(indexSrc) && /id="sort-daily"/.test(indexSrc), 'clients and daily have sort controls');
check(/id="sort-invoices"/.test(indexSrc) && /id="sort-messages"/.test(indexSrc), 'invoices and messages have sort controls');
check(/id="sort-messageLog"/.test(indexSrc), 'message log has sort control');
check(/id="sort-followupRoster"/.test(indexSrc), 'follow-up roster has sort control');
check(ListSort.DEFAULTS.followupRoster === 'lastVisit-desc', 'follow-up roster default newest last-visit');
check(/onMessageMediaPicked/.test(indexSrc) && /accept="image\/\*,video\/\*"/.test(indexSrc), 'message media file picker');
check(/getMessageMediaMeta/.test(indexSrc) && /attachMedia/.test(indexSrc), 'send path attaches media meta');
check(/msg-shared-media/.test(indexSrc) && /msg-bulk-media/.test(indexSrc), 'shared media applies to all message types and bulk send');
check(/msg-followup-media/.test(indexSrc) && /msg-promo-media/.test(indexSrc) && /msg-appointment-media/.test(indexSrc) && /msg-overdue-media/.test(indexSrc), 'each message type has its own media picker');
check(/getMessageMediaList/.test(indexSrc), 'send path collects shared + type-specific media');
check(/id="page-followup"/.test(indexSrc) && /متابعة العملاء/.test(indexSrc), 'follow-up workspace page exists');
check(/كل أنواع الرسائل/.test(indexSrc), 'media UI states it applies to all message types');
check(/sendWhatsApp\(phone, body, \{\s*type,\s*refId,\s*attachMedia: true/.test(indexSrc)
  || /attachMedia: true/.test(indexSrc.slice(indexSrc.indexOf('async function sendClientMessage'), indexSrc.indexOf('async function sendClientMessage') + 900)),
  'automated send attaches media for every message type');
check(/sortClinicList\('invoices'/.test(invoicesSrc), 'invoices page uses shared list sort');

check(/const PUSH_DEBOUNCE_MS = 2000/.test(engineSrc), 'live push debounce is 2 seconds');
check(/const DEFAULT_POLL_MS = 15000/.test(engineSrc), 'live poll interval is 15 seconds');
check(/Math\.max\(5000, Math\.min\(300000/.test(engineSrc), 'poll interval is clamped 5s–300s');
check(/emptyRemote: true/.test(engineSrc), 'missing remote ops files do not fail branch pull');

check(/function normalizeMedia/.test(gatewaySrc), 'gateway normalizes message media');
check(/stageMediaForDeeplink/.test(gatewaySrc), 'deeplink path stages image/video for WhatsApp paste');
check(/if \(!message && !media\)/.test(gatewaySrc), 'media-only messages are allowed');
check(/function collectMediaItems/.test(gatewaySrc) && /mediaList/.test(gatewaySrc), 'gateway sends shared then type-specific media');
check(/payload\.media/.test(fs.readFileSync(path.join(root, 'electron/communication/providers/custom.js'), 'utf8')),
  'custom provider forwards media');

if (errors.length) {
  console.error('FAIL list-sort-and-bulk-select');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:list-sort-and-bulk-select');
