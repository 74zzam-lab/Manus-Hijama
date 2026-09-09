'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rbac = require('../../electron/rbac-session');

const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'electron', 'main.js'), 'utf8');
const channels = [...mainSource.matchAll(/\bhandle\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const unique = [...new Set(channels)].sort();
const missing = unique.filter((channel) => !rbac.PUBLIC_CHANNELS.has(channel) && !Object.prototype.hasOwnProperty.call(rbac.CHANNEL_POLICY, channel));
assert.deepStrictEqual(missing, [], `unclassified main IPC channels: ${missing.join(', ')}`);
console.log(`PASS remediation:ipc-policy-completeness (${unique.length} handlers)`);
