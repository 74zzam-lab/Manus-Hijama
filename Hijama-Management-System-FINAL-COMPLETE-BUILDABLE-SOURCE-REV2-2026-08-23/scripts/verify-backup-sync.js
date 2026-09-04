#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cupping-bk-'));
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') {
    return {
      app: {
        getPath: (name) => {
          if (name === 'documents') return path.join(tmp, 'documents');
          if (name === 'userData') return path.join(tmp, 'userData');
          return tmp;
        }
      },
      dialog: {}
    };
  }
  return origRequire.apply(this, arguments);
};

const backup = require('../electron/backup');
const errors = [];

(async () => {
  const reg = await backup.registerCloudAccount('test@example.com', 'google');
  if (!reg.ok || !reg.email) errors.push('registerCloud=' + JSON.stringify(reg));

  const payload = JSON.stringify({ hello: 'backup' });
  const up = await backup.uploadCloud(payload, 'test-backup.json', 'google');
  if (!up.ok) errors.push('uploadCloud=' + JSON.stringify(up));

  const syncUp = await backup.uploadSyncFile(payload, 'CuppingCenter-Sync-Latest.tdw', 'google', 'CuppingCenter-Sync');
  if (!syncUp.ok) errors.push('uploadSync=' + JSON.stringify(syncUp));

  const syncDown = await backup.downloadSyncFile('CuppingCenter-Sync-Latest.tdw', 'google', 'CuppingCenter-Sync');
  if (!syncDown.ok || !syncDown.text) errors.push('downloadSync=' + JSON.stringify(syncDown));

  const local = await backup.saveLocal(payload, 'local-test.json', `Documents/Hijama Management System/Backups`);
  if (!local.ok || !fs.existsSync(local.path)) errors.push('saveLocal=' + JSON.stringify(local));

  if (errors.length) {
    console.error('FAIL:', errors.join('; '));
    process.exit(1);
  }
  console.log('OK: backup/sync vault verified');
  console.log('  cloud path:', up.path);
  console.log('  local path:', local.path);
})();
