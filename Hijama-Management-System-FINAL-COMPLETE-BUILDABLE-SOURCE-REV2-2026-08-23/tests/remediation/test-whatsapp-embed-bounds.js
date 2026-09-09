#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const { normalizeWhatsAppEmbedBounds } = require(path.join(root, 'cloud/whatsapp-embed-bounds.js'));

const rtlHost = normalizeWhatsAppEmbedBounds({
  x: 20,
  y: 120,
  width: 420,
  height: 700,
  rtl: true,
  viewportWidth: 1400,
  viewportHeight: 900,
});
check(rtlHost.x === 960, 'RTL pre-mirror places view so Electron lands on physical left (1400-20-420=960)');
check(rtlHost.y === 120 && rtlHost.width === 420 && rtlHost.height === 700, 'RTL path keeps host size and Y');
check(1400 - rtlHost.x - rtlHost.width === 20, 'after Electron RTL mirror the view matches host.left=20');

const ltrHost = normalizeWhatsAppEmbedBounds({
  x: 20,
  y: 120,
  width: 420,
  height: 700,
  rtl: false,
  viewportWidth: 1400,
  viewportHeight: 900,
});
check(ltrHost.x === 20 && ltrHost.width === 420, 'LTR keeps physical left unchanged');

const clipped = normalizeWhatsAppEmbedBounds({
  x: -40,
  y: -10,
  width: 2000,
  height: 2000,
  rtl: false,
  viewportWidth: 1000,
  viewportHeight: 800,
});
check(clipped.x === 0 && clipped.y === 0, 'negative origin clips to 0');
check(clipped.width === 1000 && clipped.height === 800, 'oversized host clips to viewport');

const screenshotNarrow = normalizeWhatsAppEmbedBounds({
  x: 20,
  y: 80,
  width: 480,
  height: 640,
  rtl: true,
  viewportWidth: 1600,
  viewportHeight: 900,
});
check(screenshotNarrow.width === 480, 'does not floor width to 320 — follows the host box');
check(1600 - screenshotNarrow.x - screenshotNarrow.width === 20, 'wide RTL window still maps back to host.left');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workspaceSrc = fs.readFileSync(path.join(root, 'electron/whatsapp-workspace.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = src.match(re);
  if (!m) return '';
  let depth = 0;
  for (let j = m.index + m[0].length - 1; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  return '';
}

const syncFn = extractFn(indexSrc, 'syncFollowupMessagingToggles');
const saveLaunchFn = extractFn(indexSrc, 'saveFollowupLaunchTarget');
const measureFn = extractFn(indexSrc, 'measureFollowupWhatsAppHost');
const saveMsgFn = extractFn(indexSrc, 'saveMessagingConfig');

check(/id="fu-wa-client"[^>]*onchange="saveFollowupLaunchTarget/.test(indexSrc), 'follow-up send-method select saves launch target only');
check(!!saveLaunchFn, 'saveFollowupLaunchTarget exists');
check(saveLaunchFn && !/refreshFollowupWorkspace\(/.test(saveLaunchFn), 'changing send method does not rebuild the follow-up workspace');
check(saveLaunchFn && !/showFollowupWhatsAppEmbed\(/.test(saveLaunchFn), 'changing send method does not re-attach WhatsApp Web');
check(syncFn && !/refreshFollowupWorkspace\(/.test(syncFn), 'follow-up toggle sync does not rebuild the whole page');
check(measureFn && /viewportWidth/.test(measureFn) && /rtl/.test(measureFn), 'embed IPC sends RTL + viewport so the overlay can match the host');
check(measureFn && /visualViewport/.test(measureFn), 'embed measure includes visualViewport offset');
check(workspaceSrc.includes("require('../cloud/whatsapp-embed-bounds')"), 'Electron workspace uses the shared bounds helper');
check(!/Math\.max\(\s*320/.test(workspaceSrc), 'workspace no longer forces a 320px-wide overlay');
check(/WebContentsView/.test(workspaceSrc) && /setBackgroundColor/.test(workspaceSrc), 'Electron 43 WebContentsView + opaque background');
check(/setAutoResize/.test(workspaceSrc), 'auto-resize is disabled so the view stays in the host box');
check(saveMsgFn && /pinWhatsAppLaunchTarget/.test(saveMsgFn), 'messaging save pins both send-method dropdowns to the written value');

if (errors.length) {
  console.error('FAIL whatsapp-embed-bounds');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:whatsapp-embed-bounds');
