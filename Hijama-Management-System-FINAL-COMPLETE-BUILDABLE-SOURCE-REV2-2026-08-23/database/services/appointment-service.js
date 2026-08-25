'use strict';

const crypto = require('crypto');

const STATUSES = Object.freeze(['pending', 'confirmed', 'arrived', 'in-service', 'completed', 'cancelled', 'no-show', 'postponed', 'rescheduled']);
const NON_BLOCKING_STATUSES = new Set(['cancelled', 'no-show', 'rescheduled']);
const TRANSITIONS = Object.freeze({
  pending: ['confirmed', 'arrived', 'cancelled', 'postponed', 'rescheduled', 'no-show'],
  confirmed: ['arrived', 'cancelled', 'postponed', 'rescheduled', 'no-show'],
  arrived: ['in-service', 'cancelled', 'rescheduled'],
  'in-service': ['completed', 'cancelled'],
  completed: [], cancelled: [], 'no-show': ['rescheduled'], postponed: ['confirmed', 'rescheduled', 'cancelled'], rescheduled: [],
});

function parseMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('appointment_time_invalid');
  return Number(match[1]) * 60 + Number(match[2]);
}

function intervalsOverlap(leftStart, leftDuration, rightStart, rightDuration) {
  return leftStart < rightStart + rightDuration && rightStart < leftStart + leftDuration;
}

function hasPermission(context, permission) {
  const defaults = {
    admin: ['appointments.manage', 'appointments.override'],
    reception: ['appointments.manage'],
    practitioner: ['appointments.manage'], doctor: ['appointments.manage'],
  };
  return [...(defaults[context?.role] || []), ...(context?.permissions || [])].includes(permission);
}

function requirePermission(context, permission = 'appointments.manage') {
  if (!hasPermission(context, permission)) throw new Error(`appointment_access_denied:${permission}`);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function required(value, field, maximum = 200) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${field}_required`);
  if (result.length > maximum) throw new Error(`${field}_too_long`);
  return result;
}

class AppointmentService {
  constructor(snapshotRepository, options = {}) {
    this.snapshots = snapshotRepository;
    this.now = options.nowProvider || (() => new Date());
    this.uuid = options.uuidProvider || (() => crypto.randomUUID());
  }

  _snapshot() {
    const snapshot = this.snapshots.getSnapshot();
    for (const key of ['bookings', 'clientsRegistry', 'doctors', 'rooms', 'scheduleBlocks', 'employeeLeaves', 'appointmentHistory', 'appointmentWaitlist', 'followUps', 'cases']) {
      if (!Array.isArray(snapshot[key])) snapshot[key] = [];
    }
    return snapshot;
  }

  _normalize(input) {
    const durationMinutes = Math.max(5, Math.min(8 * 60, Number(input.durationMinutes) || 30));
    parseMinutes(input.time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) throw new Error('appointment_date_invalid');
    return {
      id: input.id || `appointment:${this.uuid()}`,
      clientRegistryId: required(input.clientId || input.clientRegistryId, 'appointment_client'),
      doctorId: required(input.practitionerId || input.doctorId, 'appointment_practitioner'),
      roomId: String(input.roomId || '').trim(), serviceId: String(input.serviceId || '').trim(),
      date: input.date, time: input.time, durationMinutes,
      status: STATUSES.includes(input.status) ? input.status : 'pending', branchId: String(input.branchId || ''),
      createdAt: input.createdAt || this.now().toISOString(), notes: String(input.notes || '').slice(0, 2000),
      rescheduledFromId: input.rescheduledFromId || null,
    };
  }

  conflicts(candidate, snapshot) {
    const start = parseMinutes(candidate.time);
    const duration = Number(candidate.durationMinutes) || 30;
    const conflicts = [];
    for (const booking of snapshot.bookings) {
      if (booking.id === candidate.id || booking.date !== candidate.date || NON_BLOCKING_STATUSES.has(booking.status)) continue;
      const sameResource = booking.doctorId === candidate.doctorId || (candidate.roomId && booking.roomId === candidate.roomId);
      if (sameResource && intervalsOverlap(start, duration, parseMinutes(booking.time), Number(booking.durationMinutes) || 30)) {
        conflicts.push({ type: booking.doctorId === candidate.doctorId ? 'practitioner' : 'room', record: booking });
      }
    }
    for (const block of snapshot.scheduleBlocks) {
      if (block.date !== candidate.date) continue;
      if (block.practitionerId !== candidate.doctorId && (!candidate.roomId || block.roomId !== candidate.roomId)) continue;
      const blockStart = parseMinutes(block.startTime);
      const blockDuration = parseMinutes(block.endTime) - blockStart;
      if (intervalsOverlap(start, duration, blockStart, blockDuration)) conflicts.push({ type: 'schedule-block', record: block });
    }
    const onLeave = snapshot.employeeLeaves.find((leave) => leave.employeeId === candidate.doctorId
      && leave.status === 'approved' && candidate.date >= leave.dateFrom && candidate.date <= leave.dateTo);
    if (onLeave) conflicts.push({ type: 'employee-leave', record: onLeave });
    return conflicts;
  }

  schedule(input, context = {}) {
    requirePermission(context);
    const snapshot = this._snapshot();
    const booking = this._normalize(input);
    if (!snapshot.clientsRegistry.some((client) => client.id === booking.clientRegistryId)) throw new Error('appointment_client_not_found');
    if (!snapshot.doctors.some((doctor) => doctor.id === booking.doctorId && doctor.active !== false)) throw new Error('appointment_practitioner_unavailable');
    if (booking.roomId && !snapshot.rooms.some((room) => room.id === booking.roomId && room.active !== false)) throw new Error('appointment_room_unavailable');
    const conflicts = this.conflicts(booking, snapshot);
    if (conflicts.length) {
      if (!input.override || !hasPermission(context, 'appointments.override')) throw new Error(`appointment_conflict:${conflicts[0].type}`);
      if (!String(input.overrideReason || '').trim()) throw new Error('appointment_override_reason_required');
      booking.override = { reason: String(input.overrideReason).slice(0, 500), actorId: context.actorId || '', conflicts: conflicts.map((item) => item.type) };
    }
    snapshot.bookings.push(booking);
    this.snapshots.replaceSnapshot(snapshot);
    return clone(booking);
  }

  updateStatus(appointmentId, status, context = {}) {
    requirePermission(context);
    if (!STATUSES.includes(status)) throw new Error('appointment_status_invalid');
    const snapshot = this._snapshot();
    const booking = snapshot.bookings.find((item) => item.id === appointmentId);
    if (!booking) throw new Error('appointment_not_found');
    if (!(TRANSITIONS[booking.status] || []).includes(status)) throw new Error(`appointment_transition_invalid:${booking.status}:${status}`);
    const previous = clone(booking);
    booking.status = status;
    booking.updatedAt = this.now().toISOString();
    snapshot.appointmentHistory.push({
      id: `appointment-history:${this.uuid()}`, appointmentId, eventType: 'status-change', previous, next: clone(booking),
      reason: '', changedBy: context.actorId || '', createdAt: booking.updatedAt,
    });
    this.snapshots.replaceSnapshot(snapshot);
    return clone(booking);
  }

  reschedule(appointmentId, changes, context = {}) {
    requirePermission(context);
    const reason = required(changes.reason, 'reschedule_reason', 500);
    const snapshot = this._snapshot();
    const original = snapshot.bookings.find((item) => item.id === appointmentId);
    if (!original) throw new Error('appointment_not_found');
    const previous = clone(original);
    original.status = 'rescheduled';
    original.updatedAt = this.now().toISOString();
    const replacement = this._normalize({ ...original, ...changes, id: `appointment:${this.uuid()}`, status: 'confirmed', rescheduledFromId: original.id, createdAt: this.now().toISOString() });
    const conflicts = this.conflicts(replacement, snapshot);
    if (conflicts.length) throw new Error(`appointment_conflict:${conflicts[0].type}`);
    snapshot.bookings.push(replacement);
    snapshot.appointmentHistory.push({
      id: `appointment-history:${this.uuid()}`, appointmentId: original.id, eventType: 'rescheduled', previous,
      next: clone(replacement), reason, changedBy: context.actorId || '', createdAt: this.now().toISOString(),
    });
    this.snapshots.replaceSnapshot(snapshot);
    return { original: clone(original), replacement: clone(replacement) };
  }

  addWaitlist(input, context = {}) {
    requirePermission(context);
    const snapshot = this._snapshot();
    if (!snapshot.clientsRegistry.some((client) => client.id === input.clientId)) throw new Error('waitlist_client_not_found');
    const item = {
      id: input.id || `waitlist:${this.uuid()}`, clientId: input.clientId, serviceId: String(input.serviceId || ''),
      practitionerId: String(input.practitionerId || ''), preferredDate: String(input.preferredDate || ''),
      preferredTime: String(input.preferredTime || ''), priority: Math.max(0, Math.min(100, Number(input.priority) || 0)),
      status: 'waiting', createdAt: this.now().toISOString(), notes: String(input.notes || '').slice(0, 1000),
    };
    snapshot.appointmentWaitlist.push(item);
    this.snapshots.replaceSnapshot(snapshot);
    return clone(item);
  }

  waitlist(context = {}) {
    requirePermission(context);
    return this._snapshot().appointmentWaitlist.filter((item) => item.status === 'waiting')
      .sort((left, right) => right.priority - left.priority || left.createdAt.localeCompare(right.createdAt)).map(clone);
  }

  createFollowUp(input, context = {}) {
    requirePermission(context);
    const snapshot = this._snapshot();
    if (!snapshot.clientsRegistry.some((client) => client.id === input.clientId)) throw new Error('followup_client_not_found');
    const item = {
      id: input.id || `followup:${this.uuid()}`, clientId: input.clientId, visitId: input.visitId || null,
      appointmentId: input.appointmentId || null, dueDate: required(input.dueDate, 'followup_due_date', 10),
      reminderAt: input.reminderAt || null, status: 'pending', createdAt: this.now().toISOString(),
    };
    snapshot.followUps.push(item);
    this.snapshots.replaceSnapshot(snapshot);
    return clone(item);
  }

  overdue(date, context = {}) {
    requirePermission(context);
    return this._snapshot().followUps.filter((item) => item.status === 'pending' && item.dueDate < date)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate)).map(clone);
  }

  calendar(filter = {}, context = {}) {
    requirePermission(context);
    const from = filter.from || filter.date || '0000-00-00';
    const to = filter.to || filter.date || '9999-99-99';
    return this._snapshot().bookings.filter((item) => item.date >= from && item.date <= to
      && (!filter.practitionerId || item.doctorId === filter.practitionerId)
      && (!filter.roomId || item.roomId === filter.roomId)
      && (!filter.serviceId || item.serviceId === filter.serviceId))
      .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time)).map(clone);
  }
}

module.exports = { AppointmentService, NON_BLOCKING_STATUSES, STATUSES, TRANSITIONS, hasPermission, intervalsOverlap, parseMinutes };
