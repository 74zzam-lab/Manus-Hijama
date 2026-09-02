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
check(/function getWhatsAppLaunchTarget/.test(indexSrc), 'WhatsApp launch target is selectable');
check(/function goFollowupDuePage/.test(indexSrc) && /function goFollowupRosterPage/.test(indexSrc) && /function goFollowupMatchPage/.test(indexSrc), 'follow-up tables have page jump functions');
check(/id="fu-due-pagination"/.test(indexSrc) && /id="fu-roster-pagination"/.test(indexSrc) && /id="fu-match-pagination"/.test(indexSrc), 'follow-up tables have pagination containers');
check(/function exportFollowupWhatsAppContacts/.test(indexSrc) && /function syncFollowupWhatsAppContacts/.test(indexSrc), 'WhatsApp contact CSV/vCard export and auto-sync exist');
check(/function showFollowupWhatsAppEmbed/.test(indexSrc) && /function hideFollowupWhatsAppEmbed/.test(indexSrc), 'embedded WhatsApp Web workspace can show and hide');
check(/sortClinicList\('followupRoster'/.test(indexSrc), 'follow-up roster uses its own sort list');
check(/messages: function \(\) \{ if \(typeof refreshBulkTable === 'function'\) refreshBulkTable\(false\); \}/.test(indexSrc), 'messages sort still refreshes the bulk table');
check(/id="fu-wa-client"/.test(indexSrc) && /id="msg-wa-client"/.test(indexSrc), 'web vs desktop vs in-app WhatsApp launch is selectable');
check(/whatsapp:embedShow/.test(fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8')), 'preload exposes WhatsApp embed IPC');
check(/whatsapp:/.test(fs.readFileSync(path.join(root, 'electron/security/window-policy.js'), 'utf8')), 'whatsapp: protocol is allowed for desktop deep links');

const named = { name: 'أحمد علي', phone: '0500000001', fileNo: 'CL-00007' };
check(WaFollowup.contactDisplayName(named) === 'أحمد علي CL-00007', 'WhatsApp contact name is client name plus file number');
check(WaFollowup.internationalPhone(named.phone) === '+966500000001', 'Saudi mobiles become +966 international numbers');
const simpleCsv = WaFollowup.buildWhatsAppCsv([named]);
check(simpleCsv.indexOf('أحمد علي CL-00007') >= 0 && simpleCsv.indexOf('+966500000001') >= 0, 'CSV rows use display name and international phone');
const googleCsv = WaFollowup.buildGoogleContactsCsv([named]);
check(googleCsv.indexOf('Name,Given Name') === 0 && googleCsv.indexOf('أحمد علي CL-00007') >= 0, 'Google Contacts CSV keeps the same display name');
const vcf = WaFollowup.buildVcard([named]);
check(/FN:أحمد علي CL-00007/.test(vcf) && /TEL;TYPE=CELL:\+966500000001/.test(vcf), 'vCard uses display name and cell phone');

check(WaFollowup.buildWhatsAppSendUrl('0500000001', 'مرحبا', 'auto').indexOf('https://wa.me/') === 0, 'auto launch uses wa.me');
check(WaFollowup.buildWhatsAppSendUrl('0500000001', 'مرحبا', 'web').indexOf('https://web.whatsapp.com/send') === 0, 'web launch uses WhatsApp Web send URL');
check(WaFollowup.buildWhatsAppSendUrl('0500000001', 'مرحبا', 'desktop').indexOf('whatsapp://send') === 0, 'desktop launch uses whatsapp: protocol');
check(WaFollowup.buildWhatsAppSendUrl('0500000001', 'مرحبا', 'embedded').indexOf('https://web.whatsapp.com/send') === 0, 'embedded launch uses WhatsApp Web send URL');

const flat = WaFollowup.flattenMatchRows(matched);
check(flat.length === matched.matched.length + matched.unmatchedImported.length + matched.unmatchedClinic.length, 'flattened match rows include matched, unmatched imported, and unmatched clinic');
check(flat.filter((r) => r.kind === 'imported').every((r) => Number.isInteger(r.index)), 'register action keeps original unmatched imported index');

const parsedCsv = WaFollowup.parseAnyContacts(simpleCsv);
check(parsedCsv.length === 1 && parsedCsv[0].phone.endsWith('500000001'), 'exported CSV can be re-imported for matching');
const parsedGoogle = WaFollowup.parseAnyContacts(googleCsv);
check(parsedGoogle.length === 1 && parsedGoogle[0].phone.endsWith('500000001'), 'Google Contacts CSV re-imports the phone value column not the type column');

if (errors.length) {
  console.error('FAIL per-type-media-and-followup');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:per-type-media-and-followup');
