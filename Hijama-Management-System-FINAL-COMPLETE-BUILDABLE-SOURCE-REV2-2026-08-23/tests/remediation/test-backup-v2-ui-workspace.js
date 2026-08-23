'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const owner = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');

assert.match(html, /id="bk-v2-action-feedback"/, 'backup workspace must provide an accessible action-status region');
assert.match(html, /data-backup-v2-action="create-local"/, 'backup workspace must expose a local-create action');
assert.match(html, /data-backup-v2-action="create-cloud"/, 'backup workspace must expose a cloud-create action');
assert.match(html, /data-backup-v2-action="create-both"/, 'backup workspace must expose a combined-create action');
assert.match(html, /data-backup-v2-action="scan-all"/, 'backup workspace must expose a scan-all action');
assert.match(html, /let _backupV2ActionInFlight = null/, 'backup workspace must serialize interactive operations');
assert.match(html, /function setBackupV2ActionBusy\(busy, message\)/, 'backup workspace must update disabled/busy UI state');
assert.match(html, /async function runBackupV2UiAction\(kind, startLabel, operation\)/, 'backup workspace must centralize operation lifecycle');
assert.match(html, /backup_operation_in_flight/, 'backup workspace must return a deterministic duplicate-operation error');
assert.match(html, /emitBackupUiStatus\('history-refreshed'/, 'backup workspace refresh must publish a status event');
assert.match(owner, /tdw:backup-status/, 'Owner Hub must observe backup status events');
assert.doesNotMatch(html, /btn-cdb-backup" type="button"(?![^>]*disabled)/, 'legacy V1 backup action must stay disabled');

console.log('OK: Backup V2 UI workspace contract');
