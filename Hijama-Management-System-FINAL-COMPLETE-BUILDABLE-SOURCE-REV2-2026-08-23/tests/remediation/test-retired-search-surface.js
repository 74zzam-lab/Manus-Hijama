'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const fpv = fs.readFileSync(path.join(root, 'scripts', 'fpv-final-production-validation.mjs'), 'utf8');

['id="page-search"', 'id="searchQuery"', 'id="searchType"', 'id="searchResultBody"', 'performSearch()', 'clearSearch()'].forEach((needle) => {
  assert(!html.includes(needle), `retired search surface must not retain ${needle}`);
});
assert.match(html, /if \(id === 'search'\)\s*\{\s*id = 'clients';/, 'legacy search links must resolve to the canonical Clients page');
assert.match(fpv, /Retired legacy pages absent/, 'release validation must enforce removal rather than accept a hidden page');
console.log('PASS remediation:retired-search-surface');
