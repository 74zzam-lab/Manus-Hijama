'use strict';

/**
 * Path traversal / unsafe path guards (Phase 2).
 */
const path = require('path');

const TRAVERSAL_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
const UNC_RE = /^\\\\|^\/\/[^/]/;
const ABS_WIN_RE = /^[A-Za-z]:[\\/]/;
const ABS_POSIX_RE = /^\//;

function hasTraversal(input) {
  const s = String(input || '');
  if (!s) return false;
  if (TRAVERSAL_RE.test(s)) return true;
  if (s.includes('%2e%2e') || s.includes('%2E%2E')) return true;
  try {
    const decoded = decodeURIComponent(s);
    if (decoded !== s && TRAVERSAL_RE.test(decoded)) return true;
  } catch {
    /* ignore bad encoding */
  }
  return false;
}

function isAbsoluteOrUnc(input) {
  const s = String(input || '');
  return UNC_RE.test(s) || ABS_WIN_RE.test(s) || ABS_POSIX_RE.test(s);
}

/**
 * Reject absolute / UNC / traversal segments for untrusted path fragments
 * (filenames, license IDs, remote path hints used as relative names).
 */
function assertSafeRelativeName(name, label = 'path') {
  const s = String(name || '').trim();
  if (!s) {
    const err = new Error(`${label}_required`);
    err.code = 'PATH_INVALID';
    throw err;
  }
  if (hasTraversal(s) || isAbsoluteOrUnc(s) || s.includes('\0')) {
    const err = new Error(`${label}_traversal_rejected`);
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
  if (/[<>:"|?*]/.test(s) && !s.includes('/')) {
    /* Windows reserved chars in a single segment — still allow / for remote cloud paths */
  }
  return s;
}

/**
 * Resolve a path and ensure it stays under allowedRoot.
 */
function resolveInside(allowedRoot, ...segments) {
  const root = path.resolve(allowedRoot);
  const target = path.resolve(root, ...segments);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('path_outside_allowed_root');
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
  return target;
}

/**
 * Sanitize a backup filename (no directories).
 */
function safeFilename(filename, fallback) {
  const raw = String(filename || fallback || `file-${Date.now()}`).trim();
  if (hasTraversal(raw) || isAbsoluteOrUnc(raw) || raw.includes('/') || raw.includes('\\')) {
    const err = new Error('filename_traversal_rejected');
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
  return raw.replace(/[<>:"|?*\0]/g, '_') || fallback || `file-${Date.now()}`;
}

/**
 * Validate license / center ID style identifiers (no path separators).
 */
function safeId(id, label = 'id') {
  const s = String(id || '').trim();
  if (!s || hasTraversal(s) || /[\\/]/.test(s) || isAbsoluteOrUnc(s)) {
    const err = new Error(`${label}_invalid`);
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(s)) {
    const err = new Error(`${label}_format`);
    err.code = 'PATH_INVALID';
    throw err;
  }
  return s;
}

module.exports = {
  hasTraversal,
  isAbsoluteOrUnc,
  assertSafeRelativeName,
  resolveInside,
  safeFilename,
  safeId,
};
