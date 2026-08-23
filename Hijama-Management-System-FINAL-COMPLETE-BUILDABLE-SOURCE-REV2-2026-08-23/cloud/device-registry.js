/**
 * Device Registry — register peers in license.json (no primary/secondary).
 */
(function (global) {
  'use strict';

  const HEARTBEAT_MS = 5 * 60 * 1000;
  let _heartbeatTimer = null;

  function getRegistered(doc) {
    return Array.isArray(doc?.devices?.registered) ? doc.devices.registered : [];
  }

  function countActiveDevices(doc) {
    return getRegistered(doc).filter(d => d && d.active !== false).length;
  }

  function findDevice(doc, deviceUuid) {
    if (!deviceUuid) return null;
    return getRegistered(doc).find(d => d && d.deviceUuid === deviceUuid) || null;
  }

  /** Owner / HQ Admin — trusted session + DB role (PR12). */
  function canManageDevicesAsOwner(options) {
    options = options || {};
    if (options.force === true) return true;
    if (global.OwnerTrustedAuthority?.assertOwnerMutation) {
      return global.OwnerTrustedAuthority.assertOwnerMutation({
        action: options.action || 'manage_devices',
        branchId: options.branchId,
        deviceUuid: options.deviceUuid,
        user: options.user,
      }).ok;
    }
    const user = global.Auth?.getCurrentUser?.() || global.currentUser;
    if (global.RolePolicy?.canManageOrganization?.(user)) return true;
    if (global.OwnerProfile?.currentUserIsOwner?.()) return true;
    return String(user?.role || '').toLowerCase() === 'owner';
  }

  async function resignDoc(doc) {
    if (!global.LicenseCloud?.verifyLicenseDoc) return doc;
    const { signature, ...body } = doc;
    const CL = global.CommercialLicense;
    if (CL?.crypto?.hmacSha256Hex && CL.crypto.canonicalJson) {
      body.updatedAt = new Date().toISOString();
      const sig = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
      return { ...body, signature: sig };
    }
    return doc;
  }

  async function touchDevice(doc, deviceUuid, patch) {
    patch = patch || {};
    const list = getRegistered(doc).slice();
    const idx = list.findIndex(d => d && d.deviceUuid === deviceUuid);
    if (idx < 0) return { ok: false, error: 'device_not_found' };
    list[idx] = {
      ...list[idx],
      ...patch,
      lastSeenAt: new Date().toISOString()
    };
    doc.devices = { registered: list };
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
    const signed = await resignDoc(doc);
    global.LicenseCloud?.saveLocal?.(signed);
    return { ok: true, device: list[idx], doc: signed };
  }

  async function registerDevice(options) {
    options = options || {};
    const uuid = global.DeviceConfig?.ensureDeviceUuid?.();
    if (!uuid) return { ok: false, error: 'device_uuid_missing' };

    let doc = global.LicenseCloud?.loadLocal?.();
    if (!doc) return { ok: false, error: 'no_license' };

    const existing = findDevice(doc, uuid);
    if (existing) {
      return touchDevice(doc, uuid, {
        deviceName: options.deviceName || existing.deviceName,
        branchId: options.branchId || existing.branchId,
        appVersion: global.APP_VERSION || existing.appVersion || '0.0.0',
        active: true
      });
    }

    const gate = global.LicenseLimits?.canRegisterDevice?.(doc, {
      ...options,
      deviceUuid: uuid
    })
      || { ok: true, unlimited: true };
    if (!gate.ok) return gate;

    const cfg = global.DeviceConfig?.load?.() || {};
    const device = {
      deviceUuid: uuid,
      deviceName: options.deviceName || cfg.deviceName || 'Device-' + uuid.slice(0, 8),
      branchId: options.branchId || cfg.lockedBranchId || 'BR-MAIN',
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      appVersion: global.APP_VERSION || '0.0.0',
      status: options.status || 'approved',
      active: options.active !== false
    };

    const list = getRegistered(doc).concat(device);
    doc.devices = { registered: list };
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
    const signed = await resignDoc(doc);
    global.LicenseCloud?.saveLocal?.(signed);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DEVICE_REGISTERED',
        entity: 'device',
        entityId: uuid,
        summary: `Device registered: ${device.deviceName}`
      });
    }

    return { ok: true, device, doc: signed, created: true };
  }

  async function heartbeat() {
    const uuid = global.DeviceConfig?.load?.()?.deviceUuid;
    const doc = global.LicenseCloud?.loadLocal?.();
    if (!uuid || !doc || !findDevice(doc, uuid)) return { ok: false, skipped: true };
    return touchDevice(doc, uuid, { appVersion: global.APP_VERSION || '0.0.0' });
  }

  function startHeartbeat() {
    if (_heartbeatTimer) return;
    _heartbeatTimer = setInterval(() => { heartbeat().catch(() => {}); }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  }

  function listDevices(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.();
    return getRegistered(doc).filter(d => d && d.active !== false && d.status !== 'revoked');
  }

  function listPending(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.();
    return getRegistered(doc).filter(d => d && (d.status === 'pending' || (d.active === false && d.status !== 'revoked' && d.status !== 'approved')));
  }

  function canSync(doc, deviceUuid) {
    const d = findDevice(doc || global.LicenseCloud?.loadLocal?.(), deviceUuid);
    // Not in registry yet: allow local sync (bootstrap/first-run). Enrollment policies gate separately.
    if (!d) return { ok: true, unregistered: true };
    if (d.status === 'revoked') return { ok: false, error: 'device_revoked', status: d.status };
    if (d.status === 'pending') return { ok: false, error: 'device_pending_approval', status: d.status };
    if (d.active === false) return { ok: false, error: 'device_revoked_or_inactive', status: d.status || 'inactive' };
    return { ok: true, device: d };
  }

  /** V2-4 enrollment: create/update as pending until Owner approves. Does not grant sync. */
  async function requestEnrollment(options) {
    options = options || {};
    const uuid = global.DeviceConfig?.ensureDeviceUuid?.();
    if (!uuid) return { ok: false, error: 'device_uuid_missing' };
    let doc = global.LicenseCloud?.loadLocal?.();
    if (!doc) return { ok: false, error: 'no_license' };

    const existing = findDevice(doc, uuid);
    if (existing?.status === 'revoked') {
      return { ok: false, error: 'device_revoked_reapproval_required' };
    }
    if (existing?.status === 'approved' || (existing && existing.active !== false && !existing.status)) {
      return touchDevice(doc, uuid, {
        deviceName: options.deviceName || existing.deviceName,
        branchId: options.branchId || existing.branchId,
        appVersion: global.APP_VERSION || existing.appVersion || '0.0.0',
      });
    }

    const gate = global.LicenseLimits?.canRegisterDevice?.(doc, { ...options, deviceUuid: uuid })
      || { ok: true, unlimited: true };
    if (!gate.ok) return gate;

    const cfg = global.DeviceConfig?.load?.() || {};
    const device = {
      deviceUuid: uuid,
      deviceName: options.deviceName || cfg.deviceName || 'Device-' + uuid.slice(0, 8),
      branchId: options.branchId || cfg.lockedBranchId || null,
      registeredAt: existing?.registeredAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      appVersion: global.APP_VERSION || '0.0.0',
      status: 'pending',
      active: false,
      enrollmentRequestedAt: new Date().toISOString(),
    };

    const list = getRegistered(doc).slice();
    const idx = list.findIndex(d => d && d.deviceUuid === uuid);
    if (idx >= 0) list[idx] = { ...list[idx], ...device };
    else list.push(device);
    doc.devices = { registered: list };
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
    const signed = await resignDoc(doc);
    global.LicenseCloud?.saveLocal?.(signed);
    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DEVICE_ENROLLMENT_REQUESTED',
        entity: 'device',
        entityId: uuid,
        summary: `Enrollment pending: ${device.deviceName}`,
      });
    }
    if (typeof global.SqliteOutboxBridge?.audit === 'function') {
      global.SqliteOutboxBridge.audit({
        action: 'device.enrollment.requested',
        entity: 'device',
        entity_id: uuid,
        result: 'pending',
        center_id: doc.centerId,
        branch_id: device.branchId,
        device_id: uuid,
      }).catch(() => {});
    }
    return { ok: true, device, doc: signed, pending: true };
  }

  async function approveDevice(deviceUuid, options) {
    options = options || {};
    const doc = global.LicenseCloud?.loadLocal?.();
    if (!doc) return { ok: false, error: 'no_license' };
    if (!canManageDevicesAsOwner(options)) {
      return { ok: false, error: 'owner_required' };
    }
    const d = findDevice(doc, deviceUuid);
    if (!d) return { ok: false, error: 'device_not_found' };
    const gate = global.LicenseLimits?.canRegisterDevice?.(doc, { deviceUuid, ...options })
      || { ok: true };
    // already registered pending counts toward limit when approving
    const result = await touchDevice(doc, deviceUuid, {
      status: 'approved',
      active: true,
      branchId: options.branchId || d.branchId,
      approvedAt: new Date().toISOString(),
      approvedBy: options.actorId || 'owner',
    });
    if (result.ok && typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DEVICE_APPROVED',
        entity: 'device',
        entityId: deviceUuid,
        summary: `Device approved: ${d.deviceName}`,
      });
    }
    if (result.ok && typeof global.LicenseCloud?.pushToDrive === 'function') {
      try { await global.LicenseCloud.pushToDrive(result.doc); } catch { /* offline ok */ }
    }
    return { ...result, gate };
  }

  async function revokeDevice(deviceUuid, options) {
    options = options || {};
    const doc = global.LicenseCloud?.loadLocal?.();
    if (!doc) return { ok: false, error: 'no_license' };
    if (!canManageDevicesAsOwner(options)) {
      return { ok: false, error: 'owner_required' };
    }
    const d = findDevice(doc, deviceUuid);
    if (!d) return { ok: false, error: 'device_not_found' };
    const result = await touchDevice(doc, deviceUuid, {
      status: 'revoked',
      active: false,
      revokedAt: new Date().toISOString(),
      revokedBy: options.actorId || 'owner',
      revokeReason: options.reason || null,
    });
    if (result.ok && typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DEVICE_REVOKED',
        entity: 'device',
        entityId: deviceUuid,
        summary: `Device revoked: ${d.deviceName}`,
      });
    }
    if (result.ok && typeof global.LicenseCloud?.pushToDrive === 'function') {
      try { await global.LicenseCloud.pushToDrive(result.doc); } catch { /* offline ok */ }
    }
    // Revoke must not delete local business DB — only blocks sync when canSync checked
    return result;
  }

  /**
   * Explicit authorized device transfer: revoke old device, approve/register replacement.
   * Does not delete local business DB on either device.
   */
  async function transferDevice(fromDeviceUuid, toDevice, options) {
    options = options || {};
    toDevice = toDevice || {};
    if (!canManageDevicesAsOwner(options)) {
      return { ok: false, error: 'owner_required' };
    }
    const from = String(fromDeviceUuid || '').trim();
    const toUuid = String(toDevice.deviceUuid || '').trim();
    if (!from || !toUuid) return { ok: false, error: 'device_uuid_required' };
    if (from === toUuid) return { ok: false, error: 'same_device' };

    const revoked = await revokeDevice(from, { ...options, force: true, reason: options.reason || 'device_transfer' });
    if (!revoked?.ok) return revoked || { ok: false, error: 'revoke_failed' };

    let doc = global.LicenseCloud?.loadLocal?.();
    if (!doc) return { ok: false, error: 'no_license' };

    const existing = findDevice(doc, toUuid);
    let target;
    if (existing) {
      target = await touchDevice(doc, toUuid, {
        status: 'approved',
        active: true,
        deviceName: toDevice.deviceName || existing.deviceName,
        branchId: toDevice.branchId || existing.branchId || options.branchId,
        transferredAt: new Date().toISOString(),
        transferredFrom: from,
      });
    } else {
      const gate = global.LicenseLimits?.canRegisterDevice?.(doc, {
        deviceUuid: toUuid,
        branchId: toDevice.branchId || options.branchId,
      }) || { ok: true };
      if (!gate.ok) return gate;
      const list = getRegistered(doc).concat([{
        deviceUuid: toUuid,
        deviceName: toDevice.deviceName || ('Device-' + toUuid.slice(0, 8)),
        branchId: toDevice.branchId || options.branchId || 'BR-MAIN',
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        appVersion: global.APP_VERSION || '0.0.0',
        status: 'approved',
        active: true,
        transferredAt: new Date().toISOString(),
        transferredFrom: from,
      }]);
      doc.devices = { registered: list };
      doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
      const signed = await resignDoc(doc);
      global.LicenseCloud?.saveLocal?.(signed);
      target = { ok: true, device: list[list.length - 1], doc: signed };
    }

    if (!target?.ok) return target || { ok: false, error: 'transfer_target_failed' };

    // Business DB must remain intact — only sync eligibility changes.
    const fromSync = canSync(target.doc || doc, from);
    const toSync = canSync(target.doc || doc, toUuid);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DEVICE_TRANSFERRED',
        entity: 'device',
        entityId: toUuid,
        summary: `Device transferred from ${from} to ${toUuid}`,
      });
    }
    if (typeof global.LicenseCloud?.pushToDrive === 'function') {
      try { await global.LicenseCloud.pushToDrive(target.doc); } catch { /* offline ok */ }
    }

    return {
      ok: true,
      fromDeviceUuid: from,
      toDeviceUuid: toUuid,
      fromCanSync: fromSync,
      toCanSync: toSync,
      dbIntact: true,
      doc: target.doc,
    };
  }

  global.DeviceRegistry = {
    HEARTBEAT_MS,
    getRegistered,
    countActiveDevices,
    findDevice,
    registerDevice,
    requestEnrollment,
    approveDevice,
    revokeDevice,
    transferDevice,
    canSync,
    listPending,
    heartbeat,
    startHeartbeat,
    stopHeartbeat,
    listDevices,
    touchDevice
  };
})(typeof window !== 'undefined' ? window : globalThis);
