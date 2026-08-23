'use strict';

/**
 * Resumable local staging copy for Backup V2 cloud/local sources.
 * Used when a download/copy is interrupted (network or app close).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let read;
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Copy source → dest with optional interrupt failpoint and resume via .partial.
 * options.onProgress({ stage, bytesCopied, totalBytes })
 * options.failAfterBytes — simulate network drop
 */
function copyWithResume(sourcePath, destPath, options = {}) {
  const src = path.resolve(sourcePath);
  const dest = path.resolve(destPath);
  if (!fs.existsSync(src)) throw new Error('source_missing');
  ensureDir(path.dirname(dest));
  const partial = `${dest}.partial`;
  const totalBytes = fs.statSync(src).size;
  let bytesCopied = 0;
  if (fs.existsSync(partial) && options.resume !== false) {
    bytesCopied = fs.statSync(partial).size;
    if (bytesCopied > totalBytes) {
      fs.unlinkSync(partial);
      bytesCopied = 0;
    }
  }
  const flags = bytesCopied > 0 ? 'r+' : 'w';
  const srcFd = fs.openSync(src, 'r');
  const destFd = fs.openSync(partial, flags);
  try {
    if (bytesCopied > 0) fs.ftruncateSync(destFd, bytesCopied);
    const buf = Buffer.alloc(64 * 1024);
    while (bytesCopied < totalBytes) {
      if (Number.isFinite(options.failAfterBytes) && bytesCopied >= options.failAfterBytes) {
        const err = new Error('network_interrupted');
        err.code = 'network_interrupted';
        err.bytesCopied = bytesCopied;
        err.partialPath = partial;
        throw err;
      }
      let toRead = Math.min(buf.length, totalBytes - bytesCopied);
      if (Number.isFinite(options.failAfterBytes)) {
        toRead = Math.min(toRead, Math.max(0, options.failAfterBytes - bytesCopied));
        if (toRead <= 0) {
          const err = new Error('network_interrupted');
          err.code = 'network_interrupted';
          err.bytesCopied = bytesCopied;
          err.partialPath = partial;
          throw err;
        }
      }
      const read = fs.readSync(srcFd, buf, 0, toRead, bytesCopied);
      if (read <= 0) break;
      fs.writeSync(destFd, buf, 0, read, bytesCopied);
      bytesCopied += read;
      try {
        options.onProgress?.({
          stage: 'downloading',
          bytesCopied,
          totalBytes,
          percent: totalBytes ? Math.round((bytesCopied / totalBytes) * 100) : 100,
        });
      } catch { /* observer */ }
      if (Number.isFinite(options.failAfterBytes) && bytesCopied >= options.failAfterBytes && bytesCopied < totalBytes) {
        const err = new Error('network_interrupted');
        err.code = 'network_interrupted';
        err.bytesCopied = bytesCopied;
        err.partialPath = partial;
        throw err;
      }
    }
  } finally {
    try { fs.closeSync(srcFd); } catch { /* ignore */ }
    try { fs.closeSync(destFd); } catch { /* ignore */ }
  }
  if (bytesCopied !== totalBytes) {
    const err = new Error('download_incomplete');
    err.code = 'download_incomplete';
    err.bytesCopied = bytesCopied;
    err.totalBytes = totalBytes;
    throw err;
  }
  fs.renameSync(partial, dest);
  const hash = options.computeHash === false ? null : sha256File(dest);
  try {
    options.onProgress?.({ stage: 'download_complete', bytesCopied, totalBytes, percent: 100, hash });
  } catch { /* observer */ }
  return { ok: true, path: dest, bytes: totalBytes, sha256: hash, resumedFrom: options.resume === false ? 0 : undefined };
}

module.exports = {
  copyWithResume,
  sha256File,
  /**
   * Resumable upload to a local staging remote path (atomic rename to final).
   * Used for Backup V2 cloud staging and tests; Drive binary upload wraps this
   * pattern (write .partial → verify → commit rename).
   */
  uploadWithResume(sourcePath, remoteDestPath, options = {}) {
    const result = copyWithResume(sourcePath, remoteDestPath, {
      ...options,
      // reuse same partial/resume mechanics
    });
    return {
      ok: true,
      remotePath: result.path,
      bytes: result.bytes,
      sha256: result.sha256,
      resumed: true,
    };
  },
};
