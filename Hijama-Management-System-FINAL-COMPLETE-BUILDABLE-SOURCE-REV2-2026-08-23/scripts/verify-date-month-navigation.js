#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log('PASS', msg);
}

// --- Pure helpers (mirror index.html) ---
function parseISODateLocal(dateStr) {
  const s = String(dateStr || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

function recordMatchesMonth(rec, month, year) {
  const p = parseISODateLocal(rec?.date);
  if (!p) return false;
  return p.month === month && p.year === year;
}

function monthBoundsISO(year, month) {
  const y = Number(year);
  const m = Number(month);
  const lastDay = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay)}` };
}

// 31-day months include day 31
for (const sample of [
  { date: '2024-01-31', month: 1, year: 2024 },
  { date: '2024-03-31', month: 3, year: 2024 },
  { date: '2024-05-31', month: 5, year: 2024 },
  { date: '2024-07-31', month: 7, year: 2024 },
  { date: '2024-08-31', month: 8, year: 2024 },
  { date: '2024-10-31', month: 10, year: 2024 },
  { date: '2024-12-31', month: 12, year: 2024 },
]) {
  assert(recordMatchesMonth({ date: sample.date }, sample.month, sample.year),
    `day 31 retained: ${sample.date}`);
}

// Month rollover: Jan 31 data still in January after Feb 1
assert(recordMatchesMonth({ date: '2024-01-31' }, 1, 2024), 'Jan 31 stays in January');
assert(!recordMatchesMonth({ date: '2024-01-31' }, 2, 2024), 'Jan 31 not in February');

// 30-day month ends correctly
const apr = monthBoundsISO(2024, 4);
assert(apr.end === '2024-04-30', 'April has 30 days');
assert(monthBoundsISO(2024, 2).end === '2024-02-29', 'Feb 2024 leap year');

// Bookings month filter uses full month bounds (not >= today)
assert(/monthBoundsISO\(now\.getFullYear\(\), now\.getMonth\(\) \+ 1\)/.test(indexSrc),
  'bookings month filter uses monthBoundsISO');
assert(!/case 'month':\s*return b\.date >= today/.test(indexSrc),
  'bookings month filter no longer drops past days in month');

// Selectors preserve user choice
assert(/preserveSelection/.test(indexSrc), 'populateAllDateSelects preserves selection');
assert(/getEarliestDataYear/.test(indexSrc), 'year dropdown spans earliest data year');

// Attendance log has year selector
assert(/id="att-filter-year"/.test(indexSrc), 'attendance log year selector present');
assert(/recordMatchesMonth\(a, filterMonth, filterYear\)/.test(indexSrc),
  'attendance log uses recordMatchesMonth');

// Shared safe parser wired in reports/payroll paths
assert(/function parseISODateLocal/.test(indexSrc), 'parseISODateLocal defined');
assert(/recordMatchesMonth\(c, month, year\)/.test(indexSrc), 'payroll uses recordMatchesMonth');

console.log('\nAll date/month navigation checks passed.');
