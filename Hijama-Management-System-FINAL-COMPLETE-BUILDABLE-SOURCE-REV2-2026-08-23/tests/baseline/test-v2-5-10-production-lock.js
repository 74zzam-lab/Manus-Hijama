#!/usr/bin/env node
'use strict';

/** Production lock — policy docs present and Owner Hub deduped. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const docs = path.join(root, 'docs/integration-v2-5-10');
check(fs.existsSync(path.join(docs, 'PRODUCTION-LOCK.md')), 'PRODUCTION-LOCK.md missing');
check(fs.existsSync(path.join(docs, 'OPERATOR-E2E-WORKFLOW-LOCK.md')), 'OPERATOR-E2E-WORKFLOW-LOCK.md missing');

const lock = fs.readFileSync(path.join(docs, 'PRODUCTION-LOCK.md'), 'utf8');
check(/stability only/i.test(lock) && /Forbidden/.test(lock), 'PRODUCTION-LOCK policy incomplete');

const handoff = fs.readFileSync(path.join(docs, 'OPERATOR-HANDOFF.md'), 'utf8');
check(/PRODUCTION LOCK/.test(handoff), 'OPERATOR-HANDOFF references lock');

const hub = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
check(!/CenterSetupUI\.open\('manage'\).*إدارة فروع وأجهزة/.test(hub),
  'Owner Hub must not duplicate CenterSetup manage on branch card');

if (errors.length) {
  console.error('FAIL test-v2-5-10-production-lock');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK test-v2-5-10-production-lock');
