'use strict';

/**
 * RC Hotfix Round 7 — preserve device-local identity across Backup V2 restore.
 * Clinic operational data comes from backup; OAuth / device binding stays on this machine.
 */
const fs = require('fs');
const path = require('path');
const tokenStore = require('./cloud-providers/token-store');

const TOKEN_PROVIDERS = ['google'];

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function extractDeviceLocalOverlay(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const cloudV2 = settings.cloudV2 && typeof settings.cloudV2 === 'object' ? { ...settings.cloudV2 } : null;
  const cloud = settings.cloud && typeof settings.cloud === 'object' ? { ...settings.cloud } : null;
  return {
    deviceId: settings.deviceId || null,
    activeBranchId: settings.activeBranchId || settings.branchId || null,
    branchId: settings.branchId || null,
    cloudV2: cloudV2 ? {
      deviceId: cloudV2.deviceId || null,
      deviceName: cloudV2.deviceName || null,
      connectedAccount: cloudV2.connectedAccount || cloudV2.email || null,
      oauthEmail: cloudV2.oauthEmail || cloudV2.email || null,
      provider: cloudV2.provider || 'google',
      lastConnectedAt: cloudV2.lastConnectedAt || null,
    } : null,
    cloud: cloud ? {
      deviceId: cloud.deviceId || null,
      provider: cloud.provider || 'google',
      email: cloud.email || null,
    } : null,
    bootComplete: settings.bootComplete === true ? true : undefined,
    wizard: settings.wizard && typeof settings.wizard === 'object' ? { ...settings.wizard } : undefined,
  };
}

function mergeDeviceLocalOverlay(settings, overlay) {
  if (!settings || typeof settings !== 'object' || !overlay || typeof overlay !== 'object') return settings;
  if (overlay.deviceId) settings.deviceId = overlay.deviceId;
  if (overlay.activeBranchId) settings.activeBranchId = overlay.activeBranchId;
  if (overlay.branchId) settings.branchId = overlay.branchId;
  if (overlay.bootComplete === true) settings.bootComplete = true;
  if (overlay.wizard && typeof overlay.wizard === 'object') {
    settings.wizard = { ...(settings.wizard || {}), ...overlay.wizard };
  }
  if (overlay.cloudV2) {
    settings.cloudV2 = { ...(settings.cloudV2 || {}), ...overlay.cloudV2 };
  }
  if (overlay.cloud) {
    settings.cloud = { ...(settings.cloud || {}), ...overlay.cloud };
  }
  return settings;
}

function capture(userDataDir) {
  const dir = path.resolve(String(userDataDir || ''));
  const snapshot = {
    capturedAt: new Date().toISOString(),
    tokens: {},
    settingsOverlay: null,
    cloudVaultCopied: false,
  };

  TOKEN_PROVIDERS.forEach((providerId) => {
    try {
      const tokens = tokenStore.loadTokens(providerId);
      if (tokens) snapshot.tokens[providerId] = tokens;
    } catch { /* best effort */ }
  });

  const appJsonPath = path.join(dir, 'settings', 'app.json');
  const settings = readJsonSafe(appJsonPath);
  if (settings) snapshot.settingsOverlay = extractDeviceLocalOverlay(settings);

  const cloudVaultDir = path.join(dir, 'CloudVault');
  if (fs.existsSync(cloudVaultDir)) {
    try {
      snapshot.cloudVaultCopied = true;
      snapshot.cloudVaultTree = {};
      const walk = (rel) => {
        const abs = path.join(cloudVaultDir, rel);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          fs.readdirSync(abs).forEach((name) => walk(path.join(rel, name)));
        } else {
          snapshot.cloudVaultTree[rel.replace(/\\/g, '/')] = fs.readFileSync(abs);
        }
      };
      fs.readdirSync(cloudVaultDir).forEach((name) => walk(name));
    } catch { /* best effort */ }
  }

  return snapshot;
}

function restore(userDataDir, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, error: 'no_snapshot' };
  const dir = path.resolve(String(userDataDir || ''));

  Object.entries(snapshot.tokens || {}).forEach(([providerId, tokens]) => {
    try {
      if (tokens) tokenStore.saveTokens(providerId, tokens);
    } catch { /* best effort */ }
  });

  if (snapshot.cloudVaultTree && typeof snapshot.cloudVaultTree === 'object') {
    const cloudVaultDir = path.join(dir, 'CloudVault');
    Object.entries(snapshot.cloudVaultTree).forEach(([rel, buf]) => {
      try {
        const dest = path.join(cloudVaultDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
      } catch { /* best effort */ }
    });
  }

  const appJsonPath = path.join(dir, 'settings', 'app.json');
  const settings = readJsonSafe(appJsonPath);
  if (settings && snapshot.settingsOverlay) {
    mergeDeviceLocalOverlay(settings, snapshot.settingsOverlay);
    writeJsonSafe(appJsonPath, settings);
  }

  return { ok: true, restoredAt: new Date().toISOString() };
}

module.exports = {
  capture,
  restore,
  extractDeviceLocalOverlay,
  mergeDeviceLocalOverlay,
};
