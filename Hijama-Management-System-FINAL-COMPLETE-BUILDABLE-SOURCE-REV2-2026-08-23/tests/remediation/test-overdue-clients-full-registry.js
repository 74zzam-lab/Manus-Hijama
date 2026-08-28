#!/usr/bin/env node
'use strict';

/**
 * Clients-page overdue alert must list the full registry (not the paginated page),
 * support collapse, and distinguish followed-up vs not-followed-up clients.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const followup = require(path.join(root, 'cloud/overdue-followup.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const today = new Date('2026-08-28T12:00:00.000Z');
check(followup.isOverdue('2026-05-01', 75, today) === true, 'visit older than threshold is overdue');
check(followup.isOverdue('2026-08-01', 75, today) === false, 'recent visit is not overdue');

const none = followup.classifyOverdueFollowup([], { phone: '0500000001', clientKey: 'CL-1' });
check(none.followedUp === false && none.status === 'not_followed', 'no message → not followed');
check(none.labelAr.indexOf('لم تتم المتابعة') !== -1, 'not-followed Arabic label');

const sent = followup.classifyOverdueFollowup([
  { phone: '0500000001', type: 'overdue', status: 'sent', sentAt: '2026-08-20T10:00:00.000Z', channel: 'whatsapp' },
], { phone: '050-000-0001', clientKey: 'CL-1' });
check(sent.followedUp === true && sent.status === 'followed', 'sent overdue message → followed');
check(sent.labelAr.indexOf('تم المتابعة') !== -1, 'followed Arabic label');

const manual = followup.classifyOverdueFollowup([
  { phone: '0500000002', type: 'overdue', status: 'sent', channel: 'manual', clientKey: 'CL-2' },
], { phone: '0500000002', clientKey: 'CL-2' });
check(manual.followedUp === true, 'manual follow-up is recorded');
check(manual.labelAr.indexOf('يدويا') !== -1, 'manual follow-up Arabic label');

const byRef = followup.classifyOverdueFollowup([
  { type: 'overdue', status: 'queued', refId: 'overdue_file:CL-9', phone: '' },
], { phone: '', clientKey: 'file:CL-9' });
check(byRef.followedUp === true, 'follow-up matched by overdue_ clientKey refId');

check(/overdue-followup\.js/.test(indexSrc), 'index loads overdue-followup.js');
check(/function collectOverdueClients/.test(indexSrc), 'full-registry overdue collector exists');
check(/renderOverdueClientsPanel/.test(indexSrc), 'overdue panel renderer exists');
check(/toggleOverdueAlertCard/.test(indexSrc), 'overdue card can collapse');
check(/toggleOverdueGroup/.test(indexSrc), 'overdue groups can collapse');
check(/toggleOverdueClientRow/.test(indexSrc), 'individual overdue clients can collapse');
check(/لم يزر ولم تتم المتابعة/.test(indexSrc), 'UI shows not-followed state');
check(/لم يزر المركز — تم المتابعة وإرسال رسالة/.test(indexSrc), 'UI shows followed+sent state');
check(/sendOverdueFollowupMessage/.test(indexSrc), 'send follow-up logs the outreach');
check(/markOverdueClientFollowed/.test(indexSrc), 'manual follow-up recording exists');
check(/persistOverdueFollowupMessage/.test(indexSrc), 'follow-up writes messageLog');
check(/يُحسب التنبيه من/.test(indexSrc) && /سجل العملاء كاملاً/.test(indexSrc), 'legend says alert uses full registry');

const refreshFn = indexSrc.slice(indexSrc.indexOf('function refreshClientsView'), indexSrc.indexOf('function refreshClientsView') + 8000);
check(/collectOverdueClients\(threshold\)/.test(refreshFn), 'refreshClientsView collects overdue from full registry');
check(!/if \(isOverdue\) overdues\.push/.test(refreshFn), 'overdue list is not built from paginated pg.items');
check(/renderOverdueClientsPanel\(overdues\)/.test(refreshFn), 'overdue panel rendered before pagination empty-return');
check(/تم المتابعة/.test(refreshFn) && /لم تتم المتابعة/.test(refreshFn), 'table status shows follow-up state');

const dashFn = indexSrc.slice(indexSrc.indexOf('function refreshDashboardAlerts'), indexSrc.indexOf('function refreshDashboardAlerts') + 1800);
check(/collectOverdueClients/.test(dashFn), 'dashboard overdue count uses full-registry collector');

if (errors.length) {
  console.error('FAIL overdue-clients-full-registry');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:overdue-clients-full-registry');
