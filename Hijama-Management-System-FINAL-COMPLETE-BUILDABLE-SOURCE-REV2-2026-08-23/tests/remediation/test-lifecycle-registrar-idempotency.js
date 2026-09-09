#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..', '..');

function buildDocument() {
  const listeners = [];
  return {
    readyState: 'complete',
    documentElement: {},
    head: { appendChild() {} },
    addEventListener(name, callback, capture) { listeners.push({ name, callback, capture: !!capture }); },
    removeEventListener(name, callback, capture) {
      const index = listeners.findIndex((row) => row.name === name && row.callback === callback && row.capture === !!capture);
      if (index >= 0) listeners.splice(index, 1);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return { style: {}, appendChild() {} }; },
    _listeners: listeners,
  };
}

const document = buildDocument();
let observerCount = 0;
const context = {
  console,
  document,
  setTimeout() {},
  getComputedStyle() { return { display: 'none', visibility: 'hidden', opacity: '0' }; },
  MutationObserver: class MutationObserver {
    constructor() { observerCount += 1; }
    observe() {}
    disconnect() {}
  },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

const modalSrc = fs.readFileSync(path.join(root, 'cloud', 'modal-accessibility-lifecycle.js'), 'utf8');
vm.runInContext(modalSrc, context, { filename: 'modal-accessibility-lifecycle.js' });
assert.deepStrictEqual(document._listeners.map((row) => row.name).sort(), ['focusin', 'keydown']);
assert.strictEqual(observerCount, 1, 'Initial lifecycle registration must create one observer');
context.ModalA11yLifecycle.init();
assert.deepStrictEqual(document._listeners.map((row) => row.name).sort(), ['focusin', 'keydown']);
assert.strictEqual(observerCount, 1, 'Repeated modal init must not add observer/listeners');
context.ModalA11yLifecycle.destroy();
assert.strictEqual(document._listeners.length, 0, 'Modal destroy must remove owned document listeners');

const hubDocument = buildDocument();
const hubContext = {
  console,
  document: hubDocument,
  setTimeout() {},
  CustomEvent: class CustomEvent {},
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
};
hubContext.window = hubContext;
hubContext.globalThis = hubContext;
vm.createContext(hubContext);
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
vm.runInContext(hubSrc, hubContext, { filename: 'owner-hub.js' });
hubContext.OwnerHub.bindStatusEvents();
hubContext.OwnerHub.bindStatusEvents();
const statusNames = hubDocument._listeners.map((row) => row.name).sort();
assert.deepStrictEqual(statusNames, ['tdw:backup-status', 'tdw:branch-status', 'tdw:device-status', 'tdw:license-status', 'tdw:ownerhub-status', 'tdw:sync-status']);

console.log('OK: modal and Owner Hub registrars are idempotent and owned teardown is explicit');
