'use strict';

/**
 * In-memory snapshot repository for AppointmentService on Cursor Hybrid.
 * Maps to plain arrays; does not require Codex v4 tables until SoT stages land.
 */
class CursorSnapshotRepository {
  constructor(initial = {}) {
    this.snapshot = {
      bookings: [],
      clientsRegistry: [],
      doctors: [],
      rooms: [],
      scheduleBlocks: [],
      employeeLeaves: [],
      appointmentHistory: [],
      appointmentWaitlist: [],
      followUps: [],
      cases: [],
      ...initial,
    };
  }

  getSnapshot() {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  replaceSnapshot(next) {
    this.snapshot = JSON.parse(JSON.stringify(next));
    return this.snapshot;
  }
}

function isAppointmentsV2Enabled() {
  return String(process.env.HYBRID_APPOINTMENTS_V2 || '0') === '1';
}

module.exports = {
  CursorSnapshotRepository,
  isAppointmentsV2Enabled,
};
