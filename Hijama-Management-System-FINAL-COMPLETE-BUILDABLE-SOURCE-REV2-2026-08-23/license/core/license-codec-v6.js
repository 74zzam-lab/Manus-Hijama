/**
 * License V6 codec — Ed25519 verify/decode (client). No private-key signing here.
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function getConsts() {
    return CL.v6Constants || {
      SCHEMA_VERSION: 6,
      TOKEN_PREFIX: 'TDW6.',
      PUBLIC_KEY_SPKI_B64: '',
    };
  }

  function canonicalJson(obj) {
    if (CL.crypto?.canonicalJson) return CL.crypto.canonicalJson(obj);
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
  }

  function b64ToBytes(b64) {
    const norm = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
    if (typeof Buffer !== 'undefined') return Buffer.from(norm + pad, 'base64');
    const bin = atob(norm + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64Url(bytes) {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let b64;
    if (typeof Buffer !== 'undefined') b64 = Buffer.from(buf).toString('base64');
    else {
      let s = '';
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      b64 = btoa(s);
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function stripSignature(license) {
    if (!license || typeof license !== 'object') return null;
    const { signature, ...rest } = license;
    return rest;
  }

  function detectV6Input(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object' && Number(raw.schemaVersion) === 6) return { kind: 'json', license: raw };
    const s = String(raw).trim();
    if (!s) return null;
    const C = getConsts();
    if (s.startsWith(C.TOKEN_PREFIX)) return { kind: 'token', token: s };
    if (s.startsWith('{')) {
      try {
        const obj = JSON.parse(s);
        if (Number(obj.schemaVersion) === 6) return { kind: 'json', license: obj };
      } catch { /* not json */ }
    }
    return null;
  }

  function isV6Input(raw) {
    return !!detectV6Input(raw);
  }

  async function verifyEd25519(messageUtf8, signatureB64, publicKeySpkiB64) {
    const msg = typeof messageUtf8 === 'string' ? new TextEncoder().encode(messageUtf8) : messageUtf8;
    const sig = b64ToBytes(signatureB64);
    const pub = b64ToBytes(publicKeySpkiB64 || getConsts().PUBLIC_KEY_SPKI_B64);

    // Node path (tests + admin)
    try {
      if (typeof require === 'function') {
        const crypto = require('crypto');
        const key = crypto.createPublicKey({ key: Buffer.from(pub), format: 'der', type: 'spki' });
        return crypto.verify(null, Buffer.from(msg), key, Buffer.from(sig));
      }
    } catch { /* fall through to WebCrypto */ }

    if (!global.crypto?.subtle) return false;
    try {
      const key = await crypto.subtle.importKey('spki', pub, { name: 'Ed25519' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msg);
    } catch {
      return false;
    }
  }

  async function verifyLicenseObject(license, opts) {
    const C = getConsts();
    if (!license || typeof license !== 'object') {
      return { ok: false, error: 'format', message: 'license_missing' };
    }
    if (Number(license.schemaVersion) !== C.SCHEMA_VERSION) {
      return { ok: false, error: 'schema', message: 'schema_version_mismatch' };
    }
    if (!license.signature || typeof license.signature !== 'string') {
      return { ok: false, error: 'signature', message: 'signature_missing' };
    }
    const body = stripSignature(license);
    const message = canonicalJson(body);
    const pub = (opts && opts.publicKeySpkiB64) || C.PUBLIC_KEY_SPKI_B64;
    const good = await verifyEd25519(message, license.signature, pub);
    if (!good) return { ok: false, error: 'signature', message: 'signature_invalid' };
    return { ok: true, license, body, message };
  }

  function parseToken(token) {
    const C = getConsts();
    const s = String(token || '').trim();
    if (!s.startsWith(C.TOKEN_PREFIX)) return null;
    const parts = s.slice(C.TOKEN_PREFIX.length).split('.');
    if (parts.length !== 2) return null;
    try {
      const jsonBytes = b64ToBytes(parts[0]);
      const text = typeof Buffer !== 'undefined'
        ? Buffer.from(jsonBytes).toString('utf8')
        : new TextDecoder().decode(jsonBytes);
      const license = JSON.parse(text);
      license.signature = parts[1];
      return license;
    } catch {
      return null;
    }
  }

  async function decodeAndVerify(raw, opts) {
    const detected = detectV6Input(raw);
    if (!detected) return { ok: false, error: 'format', message: 'not_v6' };
    let license = detected.license;
    if (detected.kind === 'token') {
      license = parseToken(detected.token);
      if (!license) return { ok: false, error: 'format', message: 'token_parse_failed' };
    }
    return verifyLicenseObject(license, opts);
  }

  /** Encode compact token from a signed license object (admin/tests). */
  function encodeToken(signedLicense) {
    const C = getConsts();
    const body = stripSignature(signedLicense);
    const sig = signedLicense.signature;
    const payload = bytesToB64Url(
      typeof Buffer !== 'undefined'
        ? Buffer.from(canonicalJson(body), 'utf8')
        : new TextEncoder().encode(canonicalJson(body))
    );
    return C.TOKEN_PREFIX + payload + '.' + String(sig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  CL.codecV6 = {
    canonicalJson,
    detectV6Input,
    isV6Input,
    verifyEd25519,
    verifyLicenseObject,
    parseToken,
    decodeAndVerify,
    encodeToken,
    stripSignature,
    b64ToBytes,
    bytesToB64Url,
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
