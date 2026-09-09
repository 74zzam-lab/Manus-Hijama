#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const InputAccessibilityLabels = require('../../cloud/input-accessibility-labels.js');

function control(initial = {}) {
  const attrs = { ...initial };
  return {
    labels: initial.labels || [],
    dataset: {},
    getAttribute(name) { return attrs[name] || null; },
    setAttribute(name, value) { attrs[name] = String(value); },
    attrs,
  };
}

const unnamedSearch = control();
const existingAria = control({ 'aria-label': 'اسم موجود' });
const nativeLabel = control({ labels: [{ textContent: 'وسم أصلي' }] });
const root = {
  getElementById(id) {
    return {
      topbarSearch: unnamedSearch,
      'lic-feat-search': existingAria,
      'client-search': nativeLabel,
    }[id] || null;
  },
};

const applied = InputAccessibilityLabels.apply(root);
assert.ok(applied >= 1, 'At least an unnamed mapped control must receive a semantic name');
assert.strictEqual(unnamedSearch.attrs['aria-label'], 'البحث الشامل');
assert.strictEqual(unnamedSearch.dataset.a11yExplicitLabel, 'true');
assert.strictEqual(existingAria.attrs['aria-label'], 'اسم موجود', 'Existing aria label must remain untouched');
assert.strictEqual(nativeLabel.attrs['aria-label'], undefined, 'Native label must not be replaced with aria-label');
assert.ok(Object.keys(InputAccessibilityLabels.LABELS).length >= 100, 'The audited legacy semantic-name mapping must not silently shrink');
assert.strictEqual(InputAccessibilityLabels.LABELS['bk-v2-pass'], 'كلمة مرور تشفير النسخة الاحتياطية');
assert.strictEqual(InputAccessibilityLabels.LABELS['bulk-check-all'], 'تحديد كل مستلمي الرسالة الجماعية');

const index = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
assert.ok(index.includes('cloud/input-accessibility-labels.js'), 'Input semantics lifecycle must be loaded by the renderer');
console.log('OK: explicit input semantics preserve native names and cover audited legacy gaps');
