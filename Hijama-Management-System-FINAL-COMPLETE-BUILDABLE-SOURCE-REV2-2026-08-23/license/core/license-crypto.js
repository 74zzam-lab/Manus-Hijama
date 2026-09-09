(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const LIC_SECRETS = ['TDW', '2026', 'Hj@', 'مة'];
  let _signingKey = null;

  async function getSigningKey() {
    if (_signingKey) return _signingKey;
    // Legacy crypto material — TDWI2 prefix is format not brand; do not rename without key migration.
    const material = new TextEncoder().encode(LIC_SECRETS.join('|') + '|TADAWI_OFFLINE_LIC_V4');
    const salt = new TextEncoder().encode('TadawiMadina_LIC_SALT_2026');
    const base = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, 256
    );
    _signingKey = await crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return _signingKey;
  }

  async function hmacSha256Hex(message) {
    const key = await getSigningKey();
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hmacTruncated(message, bits) {
    const hex = await hmacSha256Hex(message);
    const n = parseInt(hex.slice(0, Math.ceil(bits / 4)), 16);
    return n & ((1 << bits) - 1);
  }

  function canonicalJson(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
  }

  async function computeRegistrySig(body) {
    return hmacSha256Hex(canonicalJson(body));
  }

  function featureHashFromIds(ids) {
    const sorted = [...ids].sort();
    return sorted.join(',');
  }

  async function computeFeatureHash(ids) {
    const hex = await hmacSha256Hex('FH|' + featureHashFromIds(ids));
    return hex.slice(0, 4).toUpperCase();
  }

  CL.crypto = {
    getSigningKey, hmacSha256Hex, hmacTruncated, canonicalJson,
    computeRegistrySig, computeFeatureHash, featureHashFromIds, LIC_SECRETS
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
