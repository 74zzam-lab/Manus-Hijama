'use strict';

/**
 * IPC payload validation helpers (Phase 2 + PR13 error envelope).
 */
const operationalErrorTruth = require('../../database/operational-error-truth');

const MAX_STRING = 2 * 1024 * 1024; // 2 MiB
const MAX_HTML = 5 * 1024 * 1024; // 5 MiB print HTML
const MAX_JSON_CHARS = 8 * 1024 * 1024; // 8 MiB backup payloads
const MAX_BUFFER = 1 * 1024 * 1024; // 1 MiB raw printer buffer
const MAX_OBJECT_KEYS = 500;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  err.ok = false;
  throw err;
}

function asString(value, { name = 'value', max = MAX_STRING, required = false, allowEmpty = true } = {}) {
  if (value == null || value === undefined) {
    if (required) fail('IPC_REQUIRED', `${name}_required`);
    return '';
  }
  if (typeof value !== 'string') fail('IPC_TYPE', `${name}_must_be_string`);
  if (!allowEmpty && !value) fail('IPC_REQUIRED', `${name}_required`);
  if (value.length > max) fail('IPC_TOO_LARGE', `${name}_too_large`);
  return value;
}

function asOptionalString(value, opts) {
  if (value == null) return null;
  return asString(value, opts);
}

function asBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  if (typeof value !== 'boolean') fail('IPC_TYPE', 'must_be_boolean');
  return value;
}

function asObject(value, { name = 'payload', required = false, maxKeys = MAX_OBJECT_KEYS } = {}) {
  if (value == null) {
    if (required) fail('IPC_REQUIRED', `${name}_required`);
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) fail('IPC_TYPE', `${name}_must_be_object`);
  if (Object.keys(value).length > maxKeys) fail('IPC_TOO_LARGE', `${name}_too_many_keys`);
  return value;
}

function asPayload(value, { name = 'payload', maxChars = MAX_JSON_CHARS } = {}) {
  if (typeof value === 'string') {
    if (value.length > maxChars) fail('IPC_TOO_LARGE', `${name}_too_large`);
    return value;
  }
  if (value == null) fail('IPC_REQUIRED', `${name}_required`);
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    fail('IPC_TYPE', `${name}_not_serializable`);
  }
  if (json.length > maxChars) fail('IPC_TOO_LARGE', `${name}_too_large`);
  return value;
}

function asHtml(value) {
  return asString(value, { name: 'html', max: MAX_HTML, required: true, allowEmpty: false });
}

function asBufferish(value, { name = 'buffer', max = MAX_BUFFER, required = true } = {}) {
  if (value == null) {
    if (required) fail('IPC_REQUIRED', `${name}_required`);
    return null;
  }
  if (Buffer.isBuffer(value)) {
    if (value.length > max) fail('IPC_TOO_LARGE', `${name}_too_large`);
    return value;
  }
  if (value instanceof Uint8Array) {
    if (value.byteLength > max) fail('IPC_TOO_LARGE', `${name}_too_large`);
    return Buffer.from(value);
  }
  if (Array.isArray(value)) {
    if (value.length > max) fail('IPC_TOO_LARGE', `${name}_too_large`);
    return Buffer.from(value);
  }
  // Structured clone from renderer may arrive as { type: 'Buffer', data: number[] }
  if (typeof value === 'object' && Array.isArray(value.data)) {
    if (value.data.length > max) fail('IPC_TOO_LARGE', `${name}_too_large`);
    return Buffer.from(value.data);
  }
  fail('IPC_TYPE', `${name}_invalid`);
}

function asEnum(value, allowed, { name = 'value', required = false, defaultValue = null } = {}) {
  if (value == null || value === '') {
    if (required) fail('IPC_REQUIRED', `${name}_required`);
    return defaultValue;
  }
  const s = String(value);
  if (!allowed.includes(s)) fail('IPC_ENUM', `${name}_not_allowed`);
  return s;
}

function asEmail(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) fail('IPC_REQUIRED', 'email_required');
    return '';
  }
  const s = asString(value, { name: 'email', max: 320 });
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail('IPC_FORMAT', 'email_invalid');
  return s;
}

/** Wrap handler: convert validation/RBAC errors into structured { ok:false }. */
function isValidationError(err) {
  if (!err || !err.code) return false;
  const code = String(err.code);
  return (
    code.startsWith('IPC_') ||
    code === 'PATH_TRAVERSAL' ||
    code === 'PATH_INVALID' ||
    code === 'RBAC_DENIED' ||
    code.startsWith('rbac_')
  );
}

function isRbacError(err) {
  if (!err) return false;
  const code = String(err.code || err.message || '');
  return code === 'RBAC_DENIED' || code.startsWith('rbac_') || !!err.rbac;
}

function guard(handler, { soft = true, stage = 'ipc' } = {}) {
  return async (event, ...args) => {
    try {
      const result = await handler(event, ...args);
      if (result && result.ok === false) {
        return operationalErrorTruth.enrichResult({ ...result, stage: result.stage || stage }, { stage });
      }
      return result;
    } catch (err) {
      if (soft && (isValidationError(err) || isRbacError(err))) {
        return operationalErrorTruth.enrichResult({
          ok: false,
          error: err.code || (err.rbac && err.rbac.error) || 'IPC_ERROR',
          message: err.message || String(err),
          rbac: err.rbac || null,
          stage,
        }, { stage });
      }
      throw err;
    }
  };
}

module.exports = {
  MAX_STRING,
  MAX_HTML,
  MAX_JSON_CHARS,
  MAX_BUFFER,
  fail,
  asString,
  asOptionalString,
  asBoolean,
  asObject,
  asPayload,
  asHtml,
  asBufferish,
  asEnum,
  asEmail,
  guard,
};
