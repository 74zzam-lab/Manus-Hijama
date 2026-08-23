#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { AppointmentService, STATUSES } = require('../../database/services/appointment-service');
const { CursorSnapshotRepository } = require('../../database/services/cursor-snapshot-repository');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const repo = new CursorSnapshotRepository({
  clientsRegistry: [{ id: 'client-1', name: 'Ali' }],
  doctors: [{ id: 'doc-1', name: 'Dr', active: true }],
  rooms: [{ id: 'room-1', name: 'R1', active: true }],
});
const service = new AppointmentService(repo);
const ctx = { role: 'admin', actorId: 'u1' };

const created = service.schedule(
  {
    clientId: 'client-1',
    practitionerId: 'doc-1',
    roomId: 'room-1',
    date: '2026-08-01',
    time: '10:00',
    durationMinutes: 30,
    serviceId: 'svc-1',
  },
  ctx
);
check(!!created?.id, 'schedule appointment returns id');
check(STATUSES.includes(created.status), `status ${created.status}`);

const cal = service.calendar({ date: '2026-08-01' }, ctx);
check(Array.isArray(cal) && cal.length >= 1, 'calendar returns bookings');

const updated = service.updateStatus(created.id, 'confirmed', ctx);
check(updated.status === 'confirmed', 'status transition to confirmed');

const csp = fs.readFileSync(path.join(__dirname, '..', '..', 'electron', 'security', 'window-policy.js'), 'utf8');
check(!csp.includes('fonts.googleapis.com'), 'appointments port must not touch CSP fonts');
check(!csp.includes('api.qrserver.com'), 'appointments port must not allow remote QR');

if (errors.length) {
  console.error('FAIL: hybrid appointments v2');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: hybrid appointments v2 service adapter');
