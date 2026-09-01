#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const MessageMedia = require(path.join(root, 'cloud/message-media.js'));
const WaFollowup = require(path.join(root, 'cloud/wa-followup.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const shared = { name: 'logo.png', dataUrl: 'data:image/png;base64,AAA', kind: 'image' };
const promo = { name: 'offer.jpg', dataUrl: 'data:image/jpeg;base64,BBB', kind: 'image' };
const store = MessageMedia.emptyStore();
store.shared = shared;
store.promo = promo;

const followupOnlyShared = MessageMedia.collectMediaList(store, 'followup');
check(followupOnlyShared.length === 1 && followupOnlyShared[0].slot === 'shared', 'followup without own file still gets shared media');

const promoList = MessageMedia.collectMediaList(store, 'promo');
check(promoList.length === 2 && promoList[0].slot === 'shared' && promoList[1].slot === 'promo', 'promo send includes shared then type-specific media');
check(MessageMedia.primaryMedia(store, 'promo').name === 'offer.jpg', 'primary media is the type-specific file when both exist');
check(MessageMedia.primaryMedia(store, 'overdue').name === 'logo.png', 'overdue without own file uses the shared attachment');

store.followup = { name: 'logo.png', dataUrl: 'data:image/png;base64,AAA', kind: 'image' };
check(MessageMedia.collectMediaList(store, 'followup').length === 1, 'duplicate dataUrl is not sent twice');

const imported = WaFollowup.parseContactLines('أحمد علي، 0500000001\nفاطمة\t966500000002\n0500000003 خالد\n# تعليق');
check(imported.length === 3, 'parses name/phone lines and skips comments');
check(imported[0].name === 'أحمد علي' && imported[0].phone.endsWith('500000001'), 'first imported row keeps name and digits');

const clinic = [
  { name: 'أحمد علي', phone: '0500000001', fileNo: 'CL-00007', key: 'CL-00007' },
  { name: 'سارة', phone: '0500000099', fileNo: 'CL-00012', key: 'CL-00012' },
];
const matched = WaFollowup.matchImportedContacts(imported, clinic);
check(matched.matched.length === 1 && matched.matched[0].how === 'phone' && matched.matched[0].clinic.fileNo === 'CL-00007', 'phone match links WhatsApp contact to file number');
check(matched.unmatchedImported.length === 2, 'unmatched WhatsApp numbers stay in the review list');
check(matched.unmatchedClinic.some((c) => c.fileNo === 'CL-00012'), 'clinic clients missing from the WhatsApp list are listed');

const sent = new Set();
const due = WaFollowup.listDueAutomatedMessages({
  now: Date.parse('2026-08-20T12:00:00.000Z'),
  cfg: {
    followup: { enabled: true, hoursAfter: 24 },
    appointment: { enabled: true, hoursBefore: 24 },
    overdue: { enabled: true, days: 75, cooldownDays: 30 },
  },
  cases: [{ id: 'c1', name: 'أحمد', phone: '0500000001', fileNo: 'CL-00007', createdAt: '2026-08-18T10:00:00.000Z', date: '2026-08-18' }],
  bookings: [{ id: 'b1', name: 'أحمد', phone: '0500000001', status: 'confirmed', date: '2026-08-21', time: '10:00' }],
  nextSessions: [],
  clientsMap: {
    'CL-00007': { name: 'أحمد', phone: '0500000001', fileNo: 'CL-00007', lastDate: '2026-01-01' },
  },
  wasSent: function (refId) { return sent.has(refId); },
  parseDateTimeMs: function (dateStr, timeStr) {
    return Date.parse(dateStr + 'T' + String(timeStr || '09:00').slice(0, 5) + ':00.000Z');
  },
});
check(due.some((d) => d.type === 'followup' && d.fileNo === 'CL-00007'), 'due list includes post-session followup with file number');
check(due.some((d) => d.type === 'appointment'), 'due list includes appointment reminder in the window');
check(due.some((d) => d.type === 'overdue'), 'due list includes overdue absence alert');

check(/id="msg-followup-media"/.test(indexSrc) && /id="msg-shared-media"/.test(indexSrc), 'messages page keeps shared card and per-type pickers');
check(/function loadFollowupWorkspace/.test(indexSrc) && /openClinicWhatsAppWorkspace/.test(indexSrc), 'follow-up page wires WhatsApp workspace + auto send');
check(/registerFollowupImportedClient/.test(indexSrc), 'unmatched WhatsApp contacts can be registered as previous clients');
check(/ADDON_PAGE_MODULES = \{[\s\S]*followup: 'messages'/.test(indexSrc), 'follow-up page uses the messages license module');

if (errors.length) {
  console.error('FAIL per-type-media-and-followup');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:per-type-media-and-followup');
