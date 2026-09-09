#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'modal-accessibility-lifecycle.js'), 'utf8');
const errors = [];
function check(ok, message) { if (!ok) errors.push(message); }

const context = {
  console,
  document: {
    readyState: 'loading',
    addEventListener() {},
    removeEventListener() {},
    documentElement: null,
  },
  setTimeout() {},
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(src, context, { filename: 'modal-accessibility-lifecycle.js' });

function control(label, options = {}) {
  return {
    disabled: !!options.disabled,
    textContent: label,
    value: options.value || '',
    getAttribute(name) { return name === 'aria-label' ? (options.ariaLabel || '') : null; },
  };
}

const dangerousGhost = control('إعدادات متقدمة');
const arabicCancel = control('إلغاء');
const markedCancel = control('غير ذي صلة', { ariaLabel: 'تنفيذ أمر آخر' });
const ModalA11yLifecycle = context.ModalA11yLifecycle;

const labelledFallbackModal = {
  querySelector() { return null; },
  querySelectorAll() { return [dangerousGhost, arabicCancel]; },
};
check(ModalA11yLifecycle.explicitCancelControl(labelledFallbackModal) === arabicCancel,
  'Escape fallback must select a recognisable cancel/close label rather than the first generic button');

const unsafeOnlyModal = {
  querySelector() { return null; },
  querySelectorAll() { return [dangerousGhost]; },
};
check(ModalA11yLifecycle.explicitCancelControl(unsafeOnlyModal) === null,
  'Escape must not click a generic ghost/action button when no explicit cancel/close exists');

const explicitModal = {
  querySelector(selector) {
    return selector.includes('[data-modal-cancel]') ? markedCancel : null;
  },
  querySelectorAll() { return [dangerousGhost]; },
};
check(ModalA11yLifecycle.explicitCancelControl(explicitModal) === markedCancel,
  'An explicit data-modal-cancel control must take precedence');

check(!src.includes("[data-action=\"cancel\"], .btn-ghost"),
  'The unsafe generic .btn-ghost Escape fallback must not return');
check(src.includes("modal.setAttribute('aria-modal', 'true')"), 'Modal decorator must add aria-modal');
check(src.includes('global.UxA11y?.trapFocus?.(modal, event)'), 'Modal lifecycle must retain shared Tab trapping');

if (errors.length) {
  console.error('FAIL: modal accessibility lifecycle');
  errors.forEach((error) => console.error(' - ' + error));
  process.exit(1);
}
console.log('OK: modal lifecycle semantics, trap hook, and safe Escape target selection');
