#!/usr/bin/env node
'use strict';

/**
 * Live validation: Drive v2 etag + If-Match preconditions.
 * Requires GOOGLE_DRIVE_TEST_FILE_ID and authenticated oauth token via env.
 *
 * Usage:
 *   GOOGLE_ACCESS_TOKEN=... GOOGLE_DRIVE_TEST_FILE_ID=... node scripts/validate-drive-v2-etag.mjs
 *
 * Exits 0 only when:
 *   1) v2 metadata returns etag
 *   2) matching If-Match update succeeds
 *   3) stale If-Match update returns 412
 */
const driveV2 = require('../electron/cloud-providers/google-drive-v2-api');

const token = process.env.GOOGLE_ACCESS_TOKEN || '';
const fileId = process.env.GOOGLE_DRIVE_TEST_FILE_ID || '';

if (!token || !fileId) {
  console.log('SKIP: validate-drive-v2-etag (set GOOGLE_ACCESS_TOKEN + GOOGLE_DRIVE_TEST_FILE_ID for live UAT)');
  process.exit(0);
}

const oauth2 = {
  getAccessToken: async () => ({ token }),
};

async function main() {
  const meta = await driveV2.getFileMetadata(oauth2, fileId);
  if (!meta?.etag) {
    console.error('FAIL: Drive v2 metadata missing etag');
    console.error(JSON.stringify(meta, null, 2));
    process.exit(1);
  }

  console.log('OK: v2 metadata etag', meta.etag);

  const okPayload = Buffer.from(JSON.stringify({ probe: 'cas-ok', at: new Date().toISOString() }), 'utf8');
  const okUpdate = await driveV2.updateFileMediaWithIfMatch(
    oauth2,
    fileId,
    { title: meta.title || meta.name || 'cas-probe.json' },
    'application/json',
    okPayload,
    { ifMatch: meta.etag }
  );
  console.log('OK: matching If-Match update', okUpdate?.etag || okUpdate?.responseEtag);

  const staleEtag = meta.etag;
  try {
    await driveV2.updateFileMediaWithIfMatch(
      oauth2,
      fileId,
      { title: meta.title || meta.name || 'cas-probe.json' },
      'application/json',
      Buffer.from('{"probe":"stale"}', 'utf8'),
      { ifMatch: staleEtag }
    );
    console.error('FAIL: stale If-Match should have returned 412');
    process.exit(1);
  } catch (err) {
    if (err.status !== 412 && err.code !== 'remote_revision_mismatch') {
      console.error('FAIL: unexpected stale update error', err.message);
      process.exit(1);
    }
    console.log('OK: stale If-Match returned 412/precondition failure');
  }

  console.log('PASS: live Drive v2 If-Match validation');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
