#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(html.includes('const BOOKING_STATUS_CANON = new Set(['), 'booking status canonical set missing');
check(html.includes('function normalizeBookingStatus(status)'), 'normalizeBookingStatus missing');
check(html.includes("completed: '<span class=\"tag tag-green\">🏁 مكتمل</span>'"), 'completed status badge missing');
check(html.includes("cancelled: '<span class=\"tag tag-gray\">🛑 ملغي</span>'"), 'cancelled status badge missing');
check(html.includes('function completeBooking(id)'), 'completeBooking action missing');
check(html.includes('function cancelBooking(id)'), 'cancelBooking action missing');
check(html.includes('function reopenBooking(id)'), 'reopenBooking action missing');
check(html.includes("action: 'BOOKING_CANCELLED'") === false, 'unexpected literal action marker found');
check(html.includes("logAudit('BOOKING_CANCELLED'"), 'booking cancelled audit missing');

if (errors.length) {
  console.error('FAIL: phase11 booking statuses');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase11 booking statuses checks');
