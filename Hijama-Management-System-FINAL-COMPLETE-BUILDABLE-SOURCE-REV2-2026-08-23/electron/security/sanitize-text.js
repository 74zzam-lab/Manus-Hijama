'use strict';

/**
 * Text sanitizer for untrusted strings (client names, notes, Excel cells).
 * Escapes HTML special characters — use instead of raw innerHTML interpolation.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip tags and neutralize common XSS payloads for display text.
 */
function sanitizeText(value, { maxLength = 2000 } = {}) {
  let s = String(value ?? '');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  s = s.replace(/<[^>]*>/g, '');
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return escapeHtml(s);
}

/**
 * Safe for assigning via textContent (no HTML entities needed for DOM text nodes,
 * but still strips tags / controls).
 */
function sanitizePlainText(value, { maxLength = 2000 } = {}) {
  let s = String(value ?? '');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  s = s.replace(/<[^>]*>/g, '');
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

module.exports = { escapeHtml, sanitizeText, sanitizePlainText };
