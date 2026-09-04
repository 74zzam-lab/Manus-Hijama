'use strict';

const crypto = require('crypto');
const { signingBytes } = require('../license/v6/canonical');

const CHANNELS = new Set(['stable', 'beta']);

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || '').trim());
  if (!match) throw new Error('update_version_invalid');
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    text: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
  };
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key]);
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index++) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const compared = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (compared) return compared;
  }
  return 0;
}

function assertHttps(value, code) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error(code); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(code);
  return parsed.toString();
}

function verifyManifestSignature(manifest, publicKeys) {
  const signature = manifest?.signature;
  if (signature?.algorithm !== 'Ed25519' || !signature.keyId || !signature.value) {
    throw new Error('update_signature_missing');
  }
  const key = publicKeys?.[signature.keyId];
  if (!key) throw new Error('update_signing_key_untrusted');
  let valid = false;
  try {
    valid = crypto.verify(null, signingBytes(manifest), key, Buffer.from(signature.value, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('update_signature_invalid');
  return true;
}

function validateManifest(manifest, options) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('update_manifest_invalid');
  if (manifest.schemaVersion !== 1 || manifest.product !== 'tadawi-desktop') throw new Error('update_manifest_invalid');
  const channel = String(manifest.channel || '');
  const selectedChannel = String(options?.channel || 'stable');
  if (!CHANNELS.has(channel) || !CHANNELS.has(selectedChannel)) throw new Error('update_channel_invalid');
  if (selectedChannel === 'stable' && channel !== 'stable') throw new Error('update_channel_not_allowed');
  const version = parseVersion(manifest.version).text;
  const comparison = compareVersions(version, options.currentVersion);
  if (comparison < 0) throw new Error('update_downgrade_rejected');
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ''))) throw new Error('update_hash_invalid');
  const packageUrl = assertHttps(manifest.packageUrl, 'update_package_url_invalid');
  if (String(manifest.platform) !== String(options.platform || 'win32') || String(manifest.arch) !== String(options.arch || 'x64')) {
    throw new Error('update_platform_mismatch');
  }
  if (!manifest.authenticodePublisher || String(manifest.authenticodePublisher).length > 200) {
    throw new Error('update_authenticode_publisher_missing');
  }
  if (!manifest.rollback || manifest.rollback.backupRequired !== true || !manifest.rollback.supportUrl) {
    throw new Error('update_rollback_plan_missing');
  }
  assertHttps(manifest.rollback.supportUrl, 'update_rollback_plan_invalid');
  verifyManifestSignature(manifest, options.publicKeys);
  return {
    available: comparison > 0,
    version,
    channel,
    packageUrl,
    sha256: String(manifest.sha256).toLowerCase(),
    size: Number(manifest.size) || 0,
    releaseNotes: String(manifest.releaseNotes || '').slice(0, 20_000),
    publishedAt: String(manifest.publishedAt || ''),
    authenticodePublisher: String(manifest.authenticodePublisher),
    rollback: manifest.rollback,
    manifest,
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function verifyPackageHash(buffer, expectedHash) {
  const actual = sha256(buffer);
  if (actual !== String(expectedHash || '').toLowerCase()) throw new Error('update_package_hash_mismatch');
  return actual;
}

module.exports = {
  CHANNELS,
  compareVersions,
  parseVersion,
  sha256,
  validateManifest,
  verifyManifestSignature,
  verifyPackageHash,
};
