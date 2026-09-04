/**
 * Device Cache — last-known-good snapshots under userData/cache (Cloud V2 Sprint 3).
 */
const fs = require('fs');
const path = require('path');

function safeSeg(s) {
  return String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown';
}

function createDeviceCache(userDataPath) {
  const root = path.join(userDataPath || '', 'cache');

  function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function fullPath(...segments) {
    return path.join(root, ...segments.map(safeSeg));
  }

  function writeJson(relativeSegments, data) {
    const file = path.join(root, ...relativeSegments.map(safeSeg));
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: file, size: fs.statSync(file).size };
  }

  function readJson(relativeSegments) {
    const file = path.join(root, ...relativeSegments.map(safeSeg));
    if (!fs.existsSync(file)) return { ok: false, missing: true, path: file };
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return { ok: true, data: JSON.parse(raw), path: file };
    } catch (err) {
      return { ok: false, error: err.message, path: file };
    }
  }

  function writeBranchConfig(centerId, branchId, pack) {
    if (!pack || typeof pack !== 'object') return { ok: false, error: 'invalid_pack' };
    const base = [safeSeg(centerId), 'branches', safeSeg(branchId)];
    const files = {
      'settings.json': pack.settings || pack['settings.json'],
      'prices.json': pack.prices || pack['prices.json'],
      'services.json': pack.services || pack['services.json'],
      'packages.json': pack.packages || pack['packages.json'],
      'users.json': pack.users || pack['users.json']
    };
    const written = [];
    Object.entries(files).forEach(([name, data]) => {
      if (data == null) return;
      writeJson(base.concat(name), data);
      written.push(name);
    });
    writeJson(base.concat('_meta.json'), {
      centerId,
      branchId,
      cachedAt: new Date().toISOString(),
      files: written
    });
    return { ok: true, written, root: path.join(root, ...base) };
  }

  function readBranchConfig(centerId, branchId) {
    const base = [safeSeg(centerId), 'branches', safeSeg(branchId)];
    const out = { centerId, branchId, files: {} };
    ['settings.json', 'prices.json', 'services.json', 'packages.json', 'users.json', '_meta.json'].forEach(name => {
      const res = readJson(base.concat(name));
      if (res.ok) out.files[name] = res.data;
    });
    const hasData = Object.keys(out.files).some(k => k !== '_meta.json');
    return hasData ? { ok: true, ...out } : { ok: false, missing: true };
  }

  function writeLicense(centerId, doc) {
    return writeJson([safeSeg(centerId), 'license.json'], doc);
  }

  function readLicense(centerId) {
    return readJson([safeSeg(centerId), 'license.json']);
  }

  function writeVersions(centerId, versions) {
    return writeJson([safeSeg(centerId), 'versions.json'], versions);
  }

  function readVersions(centerId) {
    return readJson([safeSeg(centerId), 'versions.json']);
  }

  function getStatus(centerId) {
    const cid = safeSeg(centerId || 'unknown');
    const base = path.join(root, cid);
    let branchCount = 0;
    const branchesDir = path.join(base, 'branches');
    if (fs.existsSync(branchesDir)) {
      branchCount = fs.readdirSync(branchesDir).filter(n => fs.statSync(path.join(branchesDir, n)).isDirectory()).length;
    }
    return {
      ok: true,
      root,
      centerId: cid,
      hasVersions: fs.existsSync(path.join(base, 'versions.json')),
      hasLicense: fs.existsSync(path.join(base, 'license.json')),
      branchCount
    };
  }

  return {
    root,
    writeJson,
    readJson,
    writeBranchConfig,
    readBranchConfig,
    writeLicense,
    readLicense,
    writeVersions,
    readVersions,
    getStatus
  };
}

module.exports = { createDeviceCache, safeSeg };
