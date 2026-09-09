/**
 * V2-5.6 — Redact secrets from ops logs before export / display.
 */
(function (global) {
  'use strict';

  const SENSITIVE_KEYS = Object.freeze([
    'password',
    'token',
    'authorization',
    'secret',
    'apikey',
    'api_key',
    'refreshtoken',
    'refresh_token',
    'clientsecret',
    'client_secret',
    'access_token',
    'id_token',
    'privatekey',
    'private_key'
  ]);

  const REDACTED = '[REDACTED]';

  function isSensitiveKey(key) {
    const k = String(key || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!k) return false;
    if (SENSITIVE_KEYS.includes(k)) return true;
    return /(password|token|secret|authorization|apikey|clientsecret|refreshtoken)/.test(k);
  }

  function redactString(s) {
    if (s == null) return s;
    let out = String(s);

    out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');

    out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');

    out = out.replace(
      /(password|passwd|pwd)\s*([:=])\s*([^\s,;|&"']+)/gi,
      '$1$2[REDACTED]'
    );

    out = out.replace(
      /(api[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token)\s*([:=])\s*([^\s,;|&"']+)/gi,
      '$1$2[REDACTED]'
    );

    /* Long base64-ish secrets (32+ url-safe / base64 chars). */
    out = out.replace(
      /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/=_-])/g,
      '[REDACTED_SECRET]'
    );

    return out;
  }

  function redactObject(obj, seen) {
    if (obj == null) return obj;
    if (typeof obj === 'string') return redactString(obj);
    if (typeof obj !== 'object') return obj;

    seen = seen || new WeakSet();
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map((item) => redactObject(item, seen));
    }

    const out = {};
    Object.keys(obj).forEach((key) => {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
        return;
      }
      const val = obj[key];
      if (typeof val === 'string') out[key] = redactString(val);
      else if (val && typeof val === 'object') out[key] = redactObject(val, seen);
      else out[key] = val;
    });
    return out;
  }

  function exportRedactedLogs(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list.map((row) => {
      if (typeof row === 'string') {
        return { message: redactString(row), redacted: true };
      }
      const clone = redactObject(row);
      if (clone && typeof clone === 'object' && !Array.isArray(clone)) {
        clone.redacted = true;
      }
      return clone;
    });
  }

  const api = {
    SENSITIVE_KEYS,
    REDACTED,
    redactString,
    redactObject,
    exportRedactedLogs,
    isSensitiveKey
  };

  global.OpsLogRedact = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
