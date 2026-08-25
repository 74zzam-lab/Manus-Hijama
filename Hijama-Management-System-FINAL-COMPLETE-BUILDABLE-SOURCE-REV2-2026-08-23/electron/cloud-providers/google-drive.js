/**
 * Google Drive — OAuth 2.0 + Drive API v3 (drive.file scope).
 * Uses google-auth-library + lightweight REST client (not full googleapis).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const { OAuth2Client } = require('google-auth-library');
const tokenStore = require('./token-store');
const { startLoopbackServer, startLoopbackServerFlexible } = require('./oauth-loopback');
const driveApi = require('./google-drive-api');
const drivePaths = require('../cloud-drive-paths');
const driveSyncCas = require('./drive-sync-cas');

const PROVIDER_ID = 'google';
const BACKUP_ROOT = drivePaths.DRIVE_APP_FOLDER;
const SYNC_FOLDER = 'CuppingCenter-Sync';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function bundledConfigPath() {
  return path.join(__dirname, '..', 'cloud-oauth.config.json');
}

function userConfigPath() {
  try {
    if (app?.getPath) return path.join(app.getPath('userData'), 'cloud-oauth.config.json');
  } catch { /* not in electron main */ }
  return null;
}

function configSearchPaths() {
  const paths = [];
  const userPath = userConfigPath();
  if (userPath) paths.push(userPath);
  paths.push(bundledConfigPath());
  return paths;
}

function parseGoogleSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const google = raw.google || raw;
  if (!google?.clientId || !google?.clientSecret) return null;
  if (String(google.clientId).includes('YOUR_') || String(google.clientSecret).includes('YOUR_')) return null;
  if (String(google.clientSecret).includes('PASTE_YOUR') || String(google.clientSecret).includes('REPLACE_ME') || String(google.clientSecret).includes('BOOTSTRAP_AT_BUILD')) return null;
  if (String(google.clientId).includes('REPLACE_ME')) return null;
  return google;
}

function loadConfig() {
  try {
    const cloudOAuth = require('../cloud-oauth-config');
    const cfg = cloudOAuth.resolveGoogleConfig();
    return {
      redirectPort: cfg.redirectPort || 42813,
      scopes: cfg.scopes?.length ? cfg.scopes : DEFAULT_SCOPES,
      clientId: cfg.clientId || '',
      clientSecret: cfg.clientSecret || '',
      projectId: cfg.projectId || ''
    };
  } catch {
    /* fallback if config module unavailable */
  }
  for (const file of configSearchPaths()) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      const google = parseGoogleSection(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (google) {
        return {
          redirectPort: 42813,
          scopes: DEFAULT_SCOPES,
          ...google,
          scopes: google.scopes?.length ? google.scopes : DEFAULT_SCOPES
        };
      }
    } catch { /* try next path */ }
  }
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    redirectPort: parseInt(process.env.GOOGLE_OAUTH_REDIRECT_PORT || '42813', 10),
    scopes: DEFAULT_SCOPES
  };
}

function isOAuthConfigured(cfg) {
  const c = cfg || loadConfig();
  return !!(c.clientId && c.clientSecret);
}

function oauthNotConfiguredMessage() {
  return 'Google OAuth غير مُضبط — أضف Client Secret في electron/cloud-oauth.config.local.json ثم أعد بناء المثبت (npm run build:prod)';
}

function createOAuthClient(cfg, redirectUri) {
  return new OAuth2Client(cfg.clientId, cfg.clientSecret, redirectUri);
}

/** PKCE S256 verifier/challenge (OAuth desktop best practice). */
function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function bindTokenRefresh(oauth2) {
  oauth2.on('tokens', (t) => {
    const current = tokenStore.loadTokens(PROVIDER_ID) || {};
    tokenStore.saveTokens(PROVIDER_ID, { ...current, ...t, updatedAt: Date.now() });
  });
}

function isTokenExpired(tokens) {
  if (!tokens?.expiry_date) return false;
  return Date.now() >= tokens.expiry_date - 60_000;
}

function needsReauthError(err) {
  const msg = String(err?.message || err || '');
  return /invalid_grant|google_not_connected|google_oauth_not_configured|google_no_access_token|unauthorized|401/i.test(msg);
}

async function getAuthedClient() {
  const cfg = loadConfig();
  if (!isOAuthConfigured(cfg)) {
    throw new Error('google_oauth_not_configured');
  }
  const port = cfg.redirectPort || 42813;
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
  const oauth2 = createOAuthClient(cfg, redirectUri);
  const tokens = tokenStore.loadTokens(PROVIDER_ID);
  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new Error('google_not_connected');
  }
  oauth2.setCredentials(tokens);
  bindTokenRefresh(oauth2);
  await oauth2.getAccessToken();
  return { oauth2, cfg, tokens: tokenStore.loadTokens(PROVIDER_ID) || tokens };
}

async function ensureAppRootFolder(oauth2) {
  await findOrCreateFolder(oauth2, drivePaths.DRIVE_APP_FOLDER, null);
}

async function connect() {
  try {
    const cfg = loadConfig();
    if (!isOAuthConfigured(cfg)) {
      return {
        ok: false,
        error: 'oauth_not_configured',
        message: oauthNotConfiguredMessage()
      };
    }
    const preferredPort = Number(cfg.redirectPort) || 42813;
    const { port, codePromise } = await startLoopbackServerFlexible(preferredPort);
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const oauth2 = createOAuthClient(cfg, redirectUri);
    const scopes = cfg.scopes || DEFAULT_SCOPES;
    const { codeVerifier, codeChallenge } = createPkcePair();
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    await shell.openExternal(authUrl);
    const code = await codePromise;
    const { tokens } = await oauth2.getToken({
      code,
      redirect_uri: redirectUri,
      codeVerifier
    });
    oauth2.setCredentials(tokens);
    bindTokenRefresh(oauth2);
    tokenStore.saveTokens(PROVIDER_ID, { ...tokens, connectedAt: Date.now() });
    await ensureAppRootFolder(oauth2);
    const email = await driveApi.getUserEmail(oauth2);
    return {
      ok: true,
      email,
      provider: PROVIDER_ID,
      oauth: true,
      pkce: true,
      expiresAt: tokens.expiry_date || null,
      hasRefreshToken: !!tokens.refresh_token,
      driveFolder: drivePaths.DRIVE_APP_FOLDER,
      redirectPort: port
    };
  } catch (err) {
    const msg = String(err && (err.message || err));
    let code = 'oauth_failed';
    if (/EADDRINUSE/i.test(msg)) code = 'oauth_port_in_use';
    else if (/timeout|oauth_timeout/i.test(msg)) code = 'oauth_timeout';
    else if (/access_denied/i.test(msg)) code = 'oauth_access_denied';
    else if (/invalid_grant/i.test(msg)) code = 'oauth_invalid_grant';
    return {
      ok: false,
      error: code,
      message: msg,
      needsReauth: true
    };
  }
}

async function disconnect() {
  try {
    const tokens = tokenStore.loadTokens(PROVIDER_ID);
    if (tokens?.access_token || tokens?.refresh_token) {
      try {
        const cfg = loadConfig();
        const oauth2 = createOAuthClient(cfg, `http://127.0.0.1:${cfg.redirectPort || 42813}/oauth/callback`);
        oauth2.setCredentials(tokens);
        if (typeof oauth2.revokeCredentials === 'function') {
          await oauth2.revokeCredentials();
        } else if (tokens.access_token) {
          await oauth2.revokeToken(tokens.access_token);
        }
      } catch {
        /* best-effort revoke — always clear local tokens */
      }
    }
  } finally {
    tokenStore.deleteTokens(PROVIDER_ID);
  }
  return { ok: true, revoked: true };
}

async function getStatus() {
  const tokens = tokenStore.loadTokens(PROVIDER_ID);
  if (!tokens?.refresh_token && !tokens?.access_token) {
    return { connected: false, email: '', provider: PROVIDER_ID, oauth: true, needsReauth: true };
  }
  try {
    const { oauth2 } = await getAuthedClient();
    const email = await driveApi.getUserEmail(oauth2);
    const latest = tokenStore.loadTokens(PROVIDER_ID) || tokens;
    return {
      connected: true,
      email,
      provider: PROVIDER_ID,
      oauth: true,
      expiresAt: latest.expiry_date || null,
      hasRefreshToken: !!latest.refresh_token,
      tokenExpired: isTokenExpired(latest),
      needsReauth: !latest.refresh_token,
      driveFolder: drivePaths.DRIVE_APP_FOLDER
    };
  } catch (err) {
    return {
      connected: false,
      email: '',
      provider: PROVIDER_ID,
      oauth: true,
      needsReauth: needsReauthError(err) || !tokens.refresh_token,
      message: err.message || String(err)
    };
  }
}

async function findFolder(oauth2, name, parentId) {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${name.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents"
  ].join(' and ');
  const res = await driveApi.listFiles(oauth2, { q, fields: 'files(id,name)', pageSize: 1 });
  return res.files?.[0]?.id || null;
}

async function findOrCreateFolder(oauth2, name, parentId) {
  const existing = await findFolder(oauth2, name, parentId);
  if (existing) return existing;
  const created = await driveApi.createFolder(oauth2, {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined
  });
  return created.id;
}

async function resolveFolderPath(oauth2, parts, { create = false } = {}) {
  let parentId = null;
  for (const part of parts) {
    parentId = create
      ? await findOrCreateFolder(oauth2, part, parentId)
      : await findFolder(oauth2, part, parentId);
    if (!parentId) return null;
  }
  return parentId;
}

async function ensureBackupFolder(oauth2, remotePath) {
  const parts = (remotePath || '').split('/').filter(Boolean);
  const fileName = parts.pop();
  let parentId = null;
  for (const part of parts) {
    parentId = await findOrCreateFolder(oauth2, part, parentId);
  }
  return { parentId, fileName };
}

async function findUniqueFileName(oauth2, parentId, baseName) {
  let candidate = baseName;
  let n = 1;
  for (;;) {
    const q = [
      `name='${candidate.replace(/'/g, "\\'")}'`,
      'trashed=false',
      parentId ? `'${parentId}' in parents` : "'root' in parents"
    ].join(' and ');
    const existing = await driveApi.listFiles(oauth2, { q, fields: 'files(id)', pageSize: 1 });
    if (!existing.files?.[0]?.id) return candidate;
    const ext = path.extname(baseName);
    const stem = baseName.slice(0, baseName.length - ext.length);
    candidate = `${stem}_${n}${ext}`;
    n++;
  }
}

async function uploadBuffer(oauth2, buffer, remotePath, mimeType, opts = {}) {
  const { parentId, fileName } = await ensureBackupFolder(oauth2, remotePath);
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), 'utf8');
  const overwrite = opts.overwrite === true;
  const noOverwrite = !overwrite && (opts.noOverwrite || drivePaths.isManualBackupName(fileName));
  let finalName = fileName;
  if (noOverwrite) {
    finalName = await findUniqueFileName(oauth2, parentId, fileName);
  } else {
    const q = [
      `name='${fileName.replace(/'/g, "\\'")}'`,
      'trashed=false',
      parentId ? `'${parentId}' in parents` : "'root' in parents"
    ].join(' and ');
    const existing = await driveApi.listFiles(oauth2, { q, fields: 'files(id)', pageSize: 1 });
    if (existing.files?.[0]?.id) {
      return driveApi.updateFile(oauth2, existing.files[0].id, { name: fileName }, mimeType || 'application/octet-stream', data);
    }
  }
  return driveApi.createFile(
    oauth2,
    { name: finalName, parents: parentId ? [parentId] : undefined },
    mimeType || 'application/octet-stream',
    data
  );
}

async function downloadByPath(oauth2, remotePath) {
  const parts = remotePath.split('/').filter(Boolean);
  const fileName = parts.pop();
  // Read path must NOT create folders (side-effect free discovery).
  const parentId = await resolveFolderPath(oauth2, parts, { create: false });
  if (parts.length && !parentId) return null;
  const q = [
    `name='${fileName.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents"
  ].join(' and ');
  const res = await driveApi.listFiles(oauth2, {
    q,
    fields: 'files(id,name,size,modifiedTime,md5Checksum,version)',
    pageSize: 1
  });
  const file = res.files?.[0];
  if (!file?.id) return null;
  const buf = await driveApi.downloadFile(oauth2, file.id);
  return { file, text: buf.toString('utf8'), payload: buf.toString('utf8'), buffer: buf };
}

function normalizePayloadBuffer(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8');
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

async function uploadBackup(payload, filename, _provider, _email, remotePath, meta) {
  try {
    const { oauth2 } = await getAuthedClient();
    const rel = remotePath || `${BACKUP_ROOT}/${filename}`;
    const data = normalizePayloadBuffer(payload);
    const mime = filename.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    const overwrite = meta?.overwrite === true || drivePaths.isMainBackupName(filename);
    const file = await uploadBuffer(oauth2, data, rel, mime, { overwrite });
    const actualPath = rel.replace(/[^/]+$/, file.name || filename);
    return { ok: true, id: file.id, path: actualPath, provider: PROVIDER_ID, md5: file.md5Checksum, filename: file.name || filename, overwritten: overwrite };
  } catch (err) {
    return { ok: false, message: err.message || String(err), needsReauth: needsReauthError(err) };
  }
}

async function uploadSyncFile(payload, filename, _provider, folder, _email) {
  try {
    const { oauth2 } = await getAuthedClient();
    const rel = `${folder || SYNC_FOLDER}/${filename}`;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const file = await uploadBuffer(oauth2, data, rel, 'application/octet-stream');
    return { ok: true, id: file.id, path: rel };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

async function downloadSyncFile(filename, _provider, folder) {
  try {
    const { oauth2 } = await getAuthedClient();
    const rel = `${folder || SYNC_FOLDER}/${filename}`;
    const res = await downloadByPath(oauth2, rel);
    if (!res) return { ok: false, message: 'الملف غير موجود على Drive' };
    return { ok: true, text: res.text, payload: res.text, file: res.file };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

async function downloadBackup(remotePath) {
  try {
    const { oauth2 } = await getAuthedClient();
    const res = await downloadByPath(oauth2, remotePath);
    if (!res) return { ok: false, message: 'الملف غير موجود' };
    const buf = res.buffer || Buffer.from(String(res.text || ''), 'utf8');
    return { ok: true, text: res.text, payload: res.text, buffer: buf, file: res.file };
  } catch (err) {
    return { ok: false, message: err.message || String(err), needsReauth: needsReauthError(err) };
  }
}

async function getFileMetadataById(fileId) {
  try {
    const { oauth2 } = await getAuthedClient();
    const res = await driveApi.getFile(oauth2, fileId);
    const file = res?.body || res?.files?.[0] || res;
    if (!file?.id) return { ok: false, message: 'file_not_found' };
    return {
      ok: true,
      item: {
        id: file.id,
        name: file.name,
        size: Number(file.size || 0),
        modifiedAt: file.modifiedTime || file.modifiedDate || null,
        md5: file.md5Checksum || null,
      },
    };
  } catch (err) {
    return { ok: false, message: err.message || String(err), needsReauth: needsReauthError(err) };
  }
}

async function downloadBackupByFileId(fileId, options = {}) {
  const started = Date.now();
  try {
    const { oauth2 } = await getAuthedClient();
    const metaRes = await getFileMetadataById(fileId);
    if (!metaRes.ok) return { ok: false, error: 'backup_remote_not_found', message: metaRes.message };
    const totalBytes = Number(metaRes.item.size || options.expectedSize || 0);
    options.onProgress?.({
      downloadedBytes: 0,
      totalBytes,
      percent: 0,
      elapsedMs: 0,
    });
    const buf = await driveApi.downloadFile(oauth2, fileId);
    const elapsedMs = Date.now() - started;
    const downloadedBytes = buf.length;
    options.onProgress?.({
      downloadedBytes,
      totalBytes: totalBytes || downloadedBytes,
      percent: 100,
      speed: elapsedMs > 0 ? Math.round((downloadedBytes / elapsedMs) * 1000) : null,
      elapsedMs,
      etaMs: 0,
    });
    return {
      ok: true,
      buffer: buf,
      file: metaRes.item,
      totalBytes: downloadedBytes,
      remotePath: options.remotePath || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: 'backup_remote_not_found',
      message: err.message || String(err),
      needsReauth: needsReauthError(err),
    };
  }
}

async function listBackups(_provider, prefix) {
  try {
    const { oauth2 } = await getAuthedClient();
    const folderPath = prefix || BACKUP_ROOT;
    const parts = folderPath.split('/').filter(Boolean);
    // List must NOT create folders — missing path means empty list.
    const parentId = await resolveFolderPath(oauth2, parts, { create: false });
    if (parts.length && !parentId) {
      return { ok: true, items: [], message: 'folder_not_found' };
    }
    const items = [];
    await collectBackupFiles(oauth2, parentId, folderPath, items);
    items.sort((a, b) => {
      const aLic = /license\.json$/i.test(a.name || '') ? 1 : 0;
      const bLic = /license\.json$/i.test(b.name || '') ? 1 : 0;
      if (aLic !== bLic) return bLic - aLic;
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return (b.modifiedAt || '').localeCompare(a.modifiedAt || '');
    });
    return { ok: true, items: items.slice(0, 500) };
  } catch (err) {
    return { ok: false, items: [], message: err.message || String(err), needsReauth: needsReauthError(err) };
  }
}

async function collectBackupFiles(oauth2, parentId, basePath, items) {
  const q = [
    parentId ? `'${parentId}' in parents` : "'root' in parents",
    'trashed=false'
  ].join(' and ');
  let pageToken;
  do {
    const res = await driveApi.listFiles(oauth2, {
      q,
      fields: 'nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType)',
      orderBy: 'folder,name',
      pageSize: 100,
      pageToken
    });
    for (const f of res.files || []) {
      const relPath = `${basePath}/${f.name}`;
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        await collectBackupFiles(oauth2, f.id, relPath, items);
      } else if (/Tadawi-Backup-V2/i.test(f.name) || /backup-.*\.tdw$/i.test(f.name) || drivePaths.isDbBackupName(f.name) || f.name.endsWith('.json')) {
        if (!f.name.endsWith('.meta.json')) {
          items.push({
            id: f.id,
            name: f.name,
            path: relPath,
            size: Number(f.size || 0),
            modifiedAt: f.modifiedTime,
            md5: f.md5Checksum,
            isMain: drivePaths.isMainBackupName(f.name)
          });
        }
      }
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
}

async function findFileByPath(oauth2, remotePath, options = {}) {
  const parts = String(remotePath || '').split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;
  const parentId = await resolveFolderPath(oauth2, parts, { create: false });
  if (parts.length && !parentId) return null;
  const q = [
    `name='${fileName.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents"
  ].join(' and ');
  const res = await driveApi.listFiles(oauth2, {
    q,
    fields: 'files(id,name,size,modifiedTime,md5Checksum,version)',
    pageSize: options.includeDuplicates ? 10 : 1,
    orderBy: 'modifiedTime desc',
  });
  const files = res.files || [];
  if (!files.length) return null;
  if (files.length === 1 && !options.includeDuplicates) return files[0];
  if (files.length === 1) return { canonical: files[0], duplicates: [] };
  return { canonical: files[0], duplicates: files.slice(1) };
}

async function trashDuplicateFiles(oauth2, duplicates) {
  for (const file of duplicates || []) {
    if (!file?.id) continue;
    try { await driveApi.trashFile(oauth2, file.id); } catch { /* best effort */ }
  }
}

const driveV2Api = require('./google-drive-v2-api');

const driveCasDeps = {
  findFileByPath: (oauth2, remotePath, opts) => findFileByPath(oauth2, remotePath, opts),
  downloadByPath: (oauth2, remotePath) => downloadByPath(oauth2, remotePath),
  resolveFolderPath: (oauth2, parts, opts) => resolveFolderPath(oauth2, parts, opts),
  getFilePreconditionV2: (oauth2, fileId) => driveV2Api.getFileMetadata(oauth2, fileId),
  updateFileMediaWithIfMatchV2: (...args) => driveV2Api.updateFileMediaWithIfMatch(...args),
  insertFileWithIfNoneMatchV2: (...args) => driveV2Api.insertFileWithIfNoneMatch(...args),
  trashDuplicates: (oauth2, duplicates) => trashDuplicateFiles(oauth2, duplicates),
};

async function conditionalReplaceJson(remotePath, payload, meta = {}) {
  try {
    const { oauth2 } = await getAuthedClient();
    return driveSyncCas.conditionalReplaceJson(driveCasDeps, oauth2, remotePath, payload, {
      ...meta,
      remotePath,
      provider: PROVIDER_ID,
    });
  } catch (err) {
    return driveSyncCas.mapDriveError(err);
  }
}

function resolveCanonicalFile(result) {
  if (!result) return null;
  if (result.canonical) return result.canonical;
  return result.id ? result : null;
}

async function deleteBackup(remotePath) {
  try {
    const { oauth2 } = await getAuthedClient();
    const file = resolveCanonicalFile(await findFileByPath(oauth2, remotePath));
    if (!file?.id) return { ok: false, message: 'الملف غير موجود' };
    await driveApi.deleteFile(oauth2, file.id);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || String(err), needsReauth: needsReauthError(err) };
  }
}

async function verifyRemote(remotePath, expectedHash) {
  try {
    const dl = await downloadBackup(remotePath);
    if (!dl.ok) return { ok: false, message: dl.message };
    const buf = dl.buffer || Buffer.from(String(dl.text || ''), 'utf8');
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const match = !expectedHash || hash === expectedHash;
    return { ok: match, hash, expectedHash, size: buf.length };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

/**
 * Atomic replace: upload temp → verify checksum → rename/overwrite final → delete temp.
 * Prevents peers from reading a half-written operational/versions JSON.
 */
async function atomicReplaceJson(remotePath, payload, meta = {}) {
  const needsCas = meta.expectedBranchRevision != null
    || meta.expectedDatabaseVersion != null
    || meta.expectedTableRevision != null
    || meta.casResource;
  if (needsCas) {
    return conditionalReplaceJson(remotePath, payload, { ...meta, remotePath });
  }
  try {
    const { oauth2 } = await getAuthedClient();
    const data = normalizePayloadBuffer(payload);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const parts = String(remotePath || '').split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return { ok: false, message: 'remote_path_invalid' };
    const dir = parts.join('/');
    const tempName = `.${fileName}.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const tempPath = dir ? `${dir}/${tempName}` : tempName;

    const tempFile = await uploadBuffer(oauth2, data, tempPath, 'application/json', { overwrite: true });
    const dl = await downloadByPath(oauth2, tempPath);
    if (!dl?.buffer) {
      try { if (tempFile?.id) await driveApi.deleteFile(oauth2, tempFile.id); } catch { /* ignore */ }
      return { ok: false, message: 'atomic_temp_missing' };
    }
    const verify = crypto.createHash('sha256').update(dl.buffer).digest('hex');
    if (verify !== hash) {
      try { if (tempFile?.id) await driveApi.deleteFile(oauth2, tempFile.id); } catch { /* ignore */ }
      return { ok: false, message: 'atomic_temp_checksum_mismatch', expected: hash, got: verify };
    }

    const finalFile = await uploadBuffer(oauth2, data, remotePath, 'application/json', { overwrite: true });
    try {
      if (tempFile?.id) await driveApi.deleteFile(oauth2, tempFile.id);
    } catch { /* cleanup best-effort */ }

    return {
      ok: true,
      id: finalFile.id,
      path: remotePath,
      sha256: hash,
      md5: finalFile.md5Checksum,
      atomic: true,
      provider: PROVIDER_ID,
    };
  } catch (err) {
    return { ok: false, message: err.message || String(err), needsReauth: needsReauthError(err) };
  }
}

module.exports = {
  id: PROVIDER_ID,
  name: 'Google Drive',
  nameAr: 'Google Drive (OAuth)',
  oauth: true,
  BACKUP_ROOT,
  SYNC_FOLDER,
  connect,
  disconnect,
  getStatus,
  getAuthedClient,
  resolveFolderPath,
  findFileByPath,
  uploadBackup,
  uploadSyncFile,
  downloadSyncFile,
  downloadBackup,
  getFileMetadataById,
  downloadBackupByFileId,
  listBackups,
  deleteBackup,
  verifyRemote,
  atomicReplaceJson,
  conditionalReplaceJson,
  loadConfig,
  isOAuthConfigured,
  oauthNotConfiguredMessage
};
