'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const inputSource = fs.readFileSync(path.join(root, 'cupping-desktop-input.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');

assert.match(inputSource, /Native keyboard editing is intentionally not intercepted/, 'native editing contract must remain explicit');
assert.ok(!inputSource.includes("document.addEventListener('keydown', onKeyDown, true)"), 'DesktopInput must not globally capture keydown shortcuts');
assert.ok(!inputSource.includes('function onKeyDown('), 'legacy shortcut interception handler must not remain');
assert.match(inputSource, /if \(initialized\) return;/, 'DesktopInput initialization must be idempotent');
assert.match(inputSource, /function destroy\(\)/, 'DesktopInput must expose listener cleanup');
assert.match(inputSource, /buildSelectionMenu/, 'non-editable selected text must have a safe copy-only path');
assert.match(inputSource, /global\.DesktopInput = \{ init, destroy, hideMenu, isEditableField \}/, 'cleanup API must remain exported');

assert.match(mainSource, /win\.webContents\.on\('context-menu', \(event, params = \{\}\) => \{/, 'production context menu must be context-aware');
assert.match(mainSource, /if \(params\.isEditable\)/, 'editable controls must receive standard editing roles');
assert.match(mainSource, /\{ role: 'undo', label: 'تراجع' \}/, 'undo must remain available');
assert.match(mainSource, /\{ role: 'paste', label: 'لصق' \}/, 'paste must remain available');
assert.match(mainSource, /selectionText/, 'selected non-editable text must receive safe copy handling');
assert.ok(!/context-menu', \(event\) => \{\s*event\.preventDefault\(\);\s*\}/.test(mainSource), 'blanket context-menu suppression must not return');
assert.ok(!/toggleDevTools|inspectElement|Developer Tools/.test(mainSource.slice(mainSource.indexOf("win.webContents.on('context-menu'"), mainSource.indexOf('function attachWindowOpenPolicy'))), 'production menu must not expose developer actions');

console.log('PASS remediation:ui-interaction-foundation');
