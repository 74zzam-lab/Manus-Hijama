#!/usr/bin/env node
'use strict';

/**
 * Drive provider CAS — v2 precondition contract (NOT v3 JSON etag).
 * Simulates Drive v2 metadata etag + If-Match; rejects v3 fields=etag assumption.
 */
const {
  conditionalReplaceJson,
  CAS_RESOURCE,
  parseBranchRevision,
  parseTableRevision,
} = require('../../electron/cloud-providers/drive-sync-cas');
const driveApi = require('../../electron/cloud-providers/google-drive-api');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function makeV2PreconditionStore() {
  const files = new Map();
  let seq = 1;
  const oauth2 = { token: 'fake' };

  function key(remotePath) {
    return String(remotePath || '').replace(/\\/g, '/');
  }

  function nextEtag() {
    seq += 1;
    return `"v2-etag-${seq}"`;
  }

  const deps = {
    async resolveFolderPath(_oauth2, parts, opts = {}) {
      if (parts.length && !opts.create) return parts.length ? 'folder-root' : null;
      return parts.length ? 'folder-root' : null;
    },
    async findFileByPath(_oauth2, remotePath) {
      const k = key(remotePath);
      const f = files.get(k);
      if (!f) return null;
      return { canonical: { id: f.id, name: f.name, version: f.driveVersion }, duplicates: f.duplicates || [] };
    },
    async downloadByPath(_oauth2, remotePath) {
      const k = key(remotePath);
      const f = files.get(k);
      if (!f) return null;
      return { text: f.text, buffer: Buffer.from(f.text, 'utf8'), file: { id: f.id } };
    },
    async getFilePreconditionV2(_oauth2, fileId) {
      const entry = [...files.values()].find((x) => x.id === fileId);
      if (!entry) return null;
      return { id: entry.id, etag: entry.v2Etag, responseEtag: entry.v2Etag, md5Checksum: 'fake-md5' };
    },
    async updateFileMediaWithIfMatchV2(_oauth2, fileId, metadata, _mime, data, options = {}) {
      const entry = [...files.values()].find((x) => x.id === fileId);
      if (!entry) throw new Error('not_found');
      if (options.ifMatch && options.ifMatch !== entry.v2Etag) {
        const err = new Error('drive_precondition_failed');
        err.code = 'remote_revision_mismatch';
        err.status = 412;
        err.retry = true;
        throw err;
      }
      entry.text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      entry.v2Etag = nextEtag();
      entry.driveVersion = String(Number(entry.driveVersion || 0) + 1);
      return { id: entry.id, etag: entry.v2Etag, responseEtag: entry.v2Etag, md5Checksum: 'fake-md5' };
    },
    async insertFileWithIfNoneMatchV2(_oauth2, metadata, _mime, data, options = {}) {
      const remotePath = metadata.parents ? `folder/${metadata.title}` : metadata.title;
      const k = key(remotePath);
      if (options.ifNoneMatch === '*' && files.has(k)) {
        const err = new Error('drive_precondition_failed');
        err.code = 'remote_revision_mismatch';
        err.status = 412;
        throw err;
      }
      const id = `file-${files.size + 1}`;
      const v2Etag = nextEtag();
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      files.set(k, { id, name: metadata.title, text, v2Etag, driveVersion: '1', duplicates: [] });
      return { id, etag: v2Etag, responseEtag: v2Etag, md5Checksum: 'fake-md5' };
    },
    trashDuplicates: async () => {},
  };

  return { oauth2, deps, files, key };
}

function testV3FieldsExcludeEtag() {
  check(!driveApi.V3_FILE_FIELDS.includes('etag'), 'v3 list fields must not request etag');
  check(!driveApi.V3_FILE_FIELDS_SINGLE.includes('etag'), 'v3 single file fields must not request etag');
  check(driveApi.V3_FILE_FIELDS.includes('version'), 'v3 fields should include version (supported output field)');
}

function testRevisionParsingContract() {
  const manifest = JSON.stringify({
    databaseVersion: 10,
    branches: { 'BR-MAD': { databaseVersion: 10 } },
  });
  const table = JSON.stringify({ revision: 7, records: [] });
  check(parseBranchRevision(manifest, 'BR-MAD') === 10, 'manifest parser reads branch databaseVersion');
  check(parseTableRevision(table) === 7, 'table parser reads table revision');
  check(parseTableRevision(manifest) === 0, 'table parser does not treat manifest databaseVersion as table revision');
}

async function testTableCasUsesTableRevisionNotBranchHead() {
  const store = makeV2PreconditionStore();
  const tablePath = 'centers/CTR-1/branches/BR-MAD/Operational/cases.json';
  store.files.set(store.key(tablePath), {
    id: 'cases-1',
    name: 'cases.json',
    text: JSON.stringify({ revision: 7, records: [{ id: 'c1' }] }),
    v2Etag: '"etag-7"',
    driveVersion: '7',
    duplicates: [],
  });

  const staleBranchHeadWrite = await conditionalReplaceJson(
    store.deps,
    store.oauth2,
    tablePath,
    JSON.stringify({ revision: 8, records: [{ id: 'c1' }, { id: 'c2' }] }),
    { casResource: CAS_RESOURCE.TABLE, expectedTableRevision: 7 }
  );
  check(staleBranchHeadWrite.ok, 'table write succeeds when table revision matches even if branch head differs');

  const wrongTableBase = await conditionalReplaceJson(
    store.deps,
    store.oauth2,
    tablePath,
    JSON.stringify({ revision: 9, records: [] }),
    { casResource: CAS_RESOURCE.TABLE, expectedTableRevision: 6 }
  );
  check(!wrongTableBase.ok && wrongTableBase.code === 'remote_revision_mismatch', 'wrong table base rejected');
}

async function testStaleBranchHeadRejectedAfterWriterA() {
  const store = makeV2PreconditionStore();
  const manifestPath = 'centers/CTR-1/branches/BR-MAD/versions.json';
  store.files.set(store.key(manifestPath), {
    id: 'manifest-1',
    name: 'versions.json',
    text: JSON.stringify({ databaseVersion: 10, branches: { 'BR-MAD': { databaseVersion: 10 } } }),
    v2Etag: '"etag-10"',
    driveVersion: '10',
    duplicates: [],
  });

  const writeA = await conditionalReplaceJson(
    store.deps,
    store.oauth2,
    manifestPath,
    JSON.stringify({ databaseVersion: 11, branches: { 'BR-MAD': { databaseVersion: 11 } }, writer: 'A' }),
    { casResource: CAS_RESOURCE.MANIFEST, expectedBranchRevision: 10, branchId: 'BR-MAD' }
  );
  check(writeA.ok, 'manifest writer A succeeds');

  const writeB = await conditionalReplaceJson(
    store.deps,
    store.oauth2,
    manifestPath,
    JSON.stringify({ databaseVersion: 11, branches: { 'BR-MAD': { databaseVersion: 11 } }, writer: 'B' }),
    { casResource: CAS_RESOURCE.MANIFEST, expectedBranchRevision: 10, branchId: 'BR-MAD' }
  );
  check(!writeB.ok && writeB.code === 'manifest_revision_mismatch', 'stale branch head rejected after A');
}

async function testStaleV2IfMatchWhenRevisionMatches() {
  const store = makeV2PreconditionStore();
  const tablePath = 'folder/cases.json';
  store.files.set(store.key(tablePath), {
    id: 'cases-1',
    name: 'cases.json',
    text: JSON.stringify({ revision: 7, records: [] }),
    v2Etag: '"etag-7"',
    driveVersion: '7',
    duplicates: [],
  });

  const staleEtag = '"etag-7"';
  store.deps.getFilePreconditionV2 = async () => ({ id: 'cases-1', etag: staleEtag, responseEtag: staleEtag });
  store.deps.updateFileMediaWithIfMatchV2 = async (_oauth2, fileId, metadata, _mime, data, options = {}) => {
    const entry = store.files.get(store.key(tablePath));
    if (options.ifMatch !== entry.v2Etag) {
      const err = new Error('drive_precondition_failed');
      err.code = 'remote_revision_mismatch';
      err.status = 412;
      throw err;
    }
    entry.text = String(data);
    entry.v2Etag = '"etag-8"';
    return { id: fileId, etag: entry.v2Etag, responseEtag: entry.v2Etag };
  };

  await store.deps.updateFileMediaWithIfMatchV2(
    store.oauth2,
    'cases-1',
    { title: 'cases.json' },
    'application/json',
    JSON.stringify({ revision: 8, records: [{ id: 'a' }] }),
    { ifMatch: staleEtag }
  );

  const writeB = await conditionalReplaceJson(
    store.deps,
    store.oauth2,
    tablePath,
    JSON.stringify({ revision: 8, records: [{ id: 'b' }] }),
    { casResource: CAS_RESOURCE.TABLE, expectedTableRevision: 7 }
  );
  check(!writeB.ok && writeB.code === 'remote_revision_mismatch', 'stale v2 If-Match rejects when table revision still matches');
}

async function testMissingV2PreconditionFailsClosed() {
  const store = makeV2PreconditionStore();
  delete store.deps.getFilePreconditionV2;
  delete store.deps.updateFileMediaWithIfMatchV2;
  store.files.set(store.key('folder/x.json'), {
    id: 'x1',
    name: 'x.json',
    text: '{"revision":1}',
    v2Etag: '"etag-1"',
    driveVersion: '1',
    duplicates: [],
  });
  const res = await conditionalReplaceJson(
    store.deps,
    store.oauth2,
    'folder/x.json',
    '{"revision":2}',
    { casResource: CAS_RESOURCE.TABLE, expectedTableRevision: 1 }
  );
  check(!res.ok && res.code === 'remote_precondition_unavailable', 'missing v2 precondition fails closed');
}

async function main() {
  testV3FieldsExcludeEtag();
  testRevisionParsingContract();
  await testTableCasUsesTableRevisionNotBranchHead();
  await testStaleBranchHeadRejectedAfterWriterA();
  await testStaleV2IfMatchWhenRevisionMatches();
  await testMissingV2PreconditionFailsClosed();

  if (errors.length) {
    console.error('FAIL: drive provider CAS semantics');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS: drive provider CAS semantics (v2 precondition contract — SOURCE VERIFIED)');
  console.log('NOTE: Google Drive v3 JSON etag is NOT used; real Drive v2 If-Match UAT still required');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
