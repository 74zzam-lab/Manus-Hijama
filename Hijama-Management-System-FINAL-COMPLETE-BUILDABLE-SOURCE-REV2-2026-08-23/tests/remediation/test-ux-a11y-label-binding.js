'use strict';

const assert = require('assert');
const UxA11y = require('../../cloud/ux-a11y.js');

function control(initial = {}) {
  const attrs = { ...initial };
  return {
    disabled: false,
    getAttribute: (key) => attrs[key] || null,
    setAttribute: (key, value) => { attrs[key] = String(value); },
    attrs,
  };
}

function label(text, input) {
  return {
    id: '',
    textContent: text,
    control: input,
    getAttribute: () => null,
    querySelector: () => null,
    parentElement: null,
  };
}

const first = control();
const preserved = control({ 'aria-label': 'موجود' });
const firstLabel = label('اسم العميل', first);
const preservedLabel = label('هاتف العميل', preserved);
const root = { querySelectorAll: () => [firstLabel, preservedLabel] };

assert.strictEqual(UxA11y.bindUnboundLabels(root), 1);
assert.match(firstLabel.id, /^ux-label-\d+$/);
assert.strictEqual(first.attrs['aria-labelledby'], firstLabel.id);
assert.strictEqual(preserved.attrs['aria-label'], 'موجود');
assert.strictEqual(preserved.attrs['aria-labelledby'], undefined);

const second = control();
const secondLabel = label('تاريخ الحجز', second);
assert.strictEqual(UxA11y.bindUnboundLabels({ querySelectorAll: () => [secondLabel] }), 1);
assert.notStrictEqual(secondLabel.id, firstLabel.id, 'generated label IDs must remain unique across calls');
console.log('PASS remediation:ux-a11y-label-binding');
