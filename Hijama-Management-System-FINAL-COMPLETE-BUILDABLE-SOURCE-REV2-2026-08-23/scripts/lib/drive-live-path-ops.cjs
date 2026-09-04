'use strict';

const driveApi = require('../../electron/cloud-providers/google-drive-api');
const driveV2Api = require('../../electron/cloud-providers/google-drive-v2-api');
const driveSyncCas = require('../../electron/cloud-providers/drive-sync-cas');

async function findFolder(oauth2, name, parentId) {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${name.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
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
    parents: parentId ? [parentId] : undefined,
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

async function findFileByPath(oauth2, remotePath, options = {}) {
  const parts = String(remotePath || '').split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;
  const parentId = await resolveFolderPath(oauth2, parts, { create: false });
  if (parts.length && !parentId) return null;
  const q = [
    `name='${fileName.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
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

async function downloadByPath(oauth2, remotePath) {
  const found = await findFileByPath(oauth2, remotePath);
  const file = found?.canonical || found;
  if (!file?.id) return null;
  const buf = await driveApi.downloadFile(oauth2, file.id);
  return { file, text: buf.toString('utf8'), buffer: buf };
}

async function trashDuplicates(oauth2, duplicates) {
  for (const file of duplicates || []) {
    if (!file?.id) continue;
    try {
      await driveApi.trashFile(oauth2, file.id);
    } catch {
      /* best effort */
    }
  }
}

async function countFilesByName(oauth2, remotePath) {
  const parts = String(remotePath || '').split('/').filter(Boolean);
  const fileName = parts.pop();
  const parentId = await resolveFolderPath(oauth2, parts, { create: false });
  if (parts.length && !parentId) return 0;
  const q = [
    `name='${fileName.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ');
  const res = await driveApi.listFiles(oauth2, {
    q,
    fields: 'files(id,name,modifiedTime)',
    pageSize: 10,
    orderBy: 'modifiedTime desc',
  });
  return (res.files || []).length;
}

function buildDriveCasDeps() {
  return {
    findFileByPath,
    downloadByPath,
    resolveFolderPath,
    getFilePreconditionV2: (oauth2, fileId) => driveV2Api.getFileMetadata(oauth2, fileId),
    updateFileMediaWithIfMatchV2: (...args) => driveV2Api.updateFileMediaWithIfMatch(...args),
    insertFileWithIfNoneMatchV2: (...args) => driveV2Api.insertFileWithIfNoneMatch(...args),
    trashDuplicates,
  };
}

async function conditionalReplace(oauth2, remotePath, payload, meta) {
  return driveSyncCas.conditionalReplaceJson(buildDriveCasDeps(), oauth2, remotePath, payload, meta);
}

module.exports = {
  findFileByPath,
  resolveFolderPath,
  downloadByPath,
  countFilesByName,
  buildDriveCasDeps,
  conditionalReplace,
  driveSyncCas,
};
