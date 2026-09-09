'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registerBackupV2Ipc } = require('../../electron/backup-v2-ipc');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-backup-path-'));
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-external-backup-'));
const externalFile = path.join(externalDir, 'outside.tdw');
fs.writeFileSync(externalFile, 'not-a-backup');
const handlers = new Map();
const V = {
  asObject: (value) => value && typeof value === 'object' ? value : {},
  asString: (value) => String(value || ''),
};

registerBackupV2Ipc({
  handle: (channel, handler) => handlers.set(channel, handler),
  V,
  getUserDataPath: () => userData,
  appVersion: 'test',
  app: {},
  closeDatabase: async () => {},
  reopenDatabase: async () => {},
  getLiveIdentity: () => ({}),
});

(async () => {
  for (const channel of ['backup:v2:verify', 'backup:v2:inspect', 'backup:v2:restore']) {
    const handler = handlers.get(channel);
    assert.ok(handler, `${channel} must be registered`);
    await assert.rejects(
      () => handler({}, { filePath: externalFile }),
      (error) => error?.code === 'backup_local_path_denied',
      `${channel} must reject a renderer-supplied external file path`
    );
  }
  for (const [channel, options] of [
    ['backup:v2:importLegacy', { filePath: externalFile, password: 'password-123' }],
    ['backup:v2:stageRemote', { sourcePath: externalFile }],
    ['backup:v2:downloadAndRestore', { sourcePath: externalFile }],
    ['backup:v2:restoreUnified', { source: 'local', filePath: externalFile }],
  ]) {
    await assert.rejects(
      () => handlers.get(channel)({}, options),
      (error) => error?.code === 'backup_local_path_denied',
      `${channel} must reject an external local path before staging or restore`
    );
  }
  await assert.rejects(
    () => handlers.get('backup:v2:listLocal')({}, { dir: externalDir }),
    (error) => error?.code === 'backup_local_directory_denied',
    'listLocal must reject external folders rather than disclose arbitrary filesystem contents'
  );
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(externalDir, { recursive: true, force: true });
  console.log('PASS remediation:backup-local-path-containment');
})().catch((error) => {
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(externalDir, { recursive: true, force: true });
  console.error(error.stack || error);
  process.exit(1);
});
