/**
 * Google Drive API v2 — conditional update preconditions only.
 * Drive v3 File resource does not expose `etag`; v2 remains the supported
 * source for If-Match tokens on media updates (see Google v2→v3 migration ref).
 */
const DRIVE_V2 = 'https://www.googleapis.com/drive/v2';
const UPLOAD_V2 = 'https://www.googleapis.com/upload/drive/v2';

async function getAccessToken(oauth2) {
  const res = await oauth2.getAccessToken();
  const token = res?.token || res;
  if (!token) throw new Error('google_no_access_token');
  return token;
}

async function driveV2Fetch(oauth2, url, options = {}) {
  const token = await getAccessToken(oauth2);
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const responseEtag = res.headers.get('etag') || res.headers.get('ETag') || null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 412) {
      const err = new Error('drive_precondition_failed');
      err.code = 'remote_revision_mismatch';
      err.status = 412;
      err.retry = true;
      err.details = text.slice(0, 400);
      err.responseEtag = responseEtag;
      throw err;
    }
    throw new Error(`drive_v2_api_${res.status}:${text.slice(0, 200)}`);
  }
  if (options.raw) {
    return { response: res, responseEtag, status: res.status };
  }
  if (options.method === 'DELETE' || res.status === 204) {
    return { ok: true, responseEtag, status: res.status };
  }
  const ct = res.headers.get('content-type') || '';
  let body = null;
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { body, responseEtag, status: res.status };
}

function buildMultipartBody(metadata, mimeType, data) {
  const boundary = `cupping_v2_${Date.now().toString(36)}`;
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    'utf8'
  );
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8');
  const fileData = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    boundary,
    body: Buffer.concat([metaPart, fileHeader, fileData, end]),
  };
}

async function getFileMetadata(oauth2, fileId, fields = 'id,title,etag,headRevisionId,md5Checksum,modifiedDate,fileSize') {
  const params = new URLSearchParams({ fields });
  const res = await driveV2Fetch(oauth2, `${DRIVE_V2}/files/${fileId}?${params}`);
  const file = res.body || {};
  const etag = file.etag || res.responseEtag || null;
  return { ...file, etag, responseEtag: res.responseEtag };
}

async function updateFileMediaWithIfMatch(oauth2, fileId, metadata, mimeType, data, options = {}) {
  const { boundary, body } = buildMultipartBody(metadata, mimeType, data);
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,title,etag,md5Checksum,modifiedDate',
  });
  const headers = { 'Content-Type': `multipart/related; boundary=${boundary}` };
  if (options.ifMatch) headers['If-Match'] = String(options.ifMatch);
  const res = await driveV2Fetch(oauth2, `${UPLOAD_V2}/files/${fileId}?${params}`, {
    method: 'PUT',
    headers,
    body,
  });
  const file = res.body || {};
  return {
    ...file,
    etag: file.etag || res.responseEtag || null,
    responseEtag: res.responseEtag,
  };
}

async function insertFileWithIfNoneMatch(oauth2, metadata, mimeType, data, options = {}) {
  const { boundary, body } = buildMultipartBody(metadata, mimeType, data);
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,title,etag,md5Checksum,modifiedDate',
  });
  const headers = { 'Content-Type': `multipart/related; boundary=${boundary}` };
  if (options.ifNoneMatch) headers['If-None-Match'] = String(options.ifNoneMatch);
  const res = await driveV2Fetch(oauth2, `${UPLOAD_V2}/files?${params}`, {
    method: 'POST',
    headers,
    body,
  });
  const file = res.body || {};
  return {
    ...file,
    etag: file.etag || res.responseEtag || null,
    responseEtag: res.responseEtag,
  };
}

module.exports = {
  getFileMetadata,
  updateFileMediaWithIfMatch,
  insertFileWithIfNoneMatch,
  driveV2Fetch,
};
