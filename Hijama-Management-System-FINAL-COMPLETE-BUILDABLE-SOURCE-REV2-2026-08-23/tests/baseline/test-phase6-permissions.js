#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const extSrc = fs.readFileSync(path.join(root, 'cupping-ext-modules.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const errors = [];

function check(cond, msg) {
  if (!cond) errors.push(msg);
}

check(extSrc.includes('function sanitizePermissionMap(raw)'), 'sanitizePermissionMap missing');
check(extSrc.includes('if (!ALLOWED_PERMISSION_KEYS.includes(key)) return false;'), 'unknown permission keys must be denied');
check(extSrc.includes('return sanitizePermissionMap(ROLE_PRESETS[user.role] || ROLE_PRESETS.reception);'), 'role presets must be normalized');
check(extSrc.includes('window.PermissionPolicy.sanitizePermissionMap = sanitizePermissionMap;'), 'PermissionPolicy sanitizer must be exposed');

check(html.includes("if (!checkAdmin('إدارة المستخدمين')) return;"), 'saveUserAsync admin guard missing');
check(html.includes('isBranchPrimaryUser(users[idx])'), 'primary admin protection missing');
check(html.includes('window.PermissionPolicy?.sanitizePermissionMap'), 'user permissions must be sanitized before save');
check(html.includes("notify('⚠️ اسم المستخدم مستخدم بالفعل"), 'duplicate username guard missing');

if (errors.length) {
  console.error('FAIL: phase6 permissions');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase6 permissions hardening checks');
