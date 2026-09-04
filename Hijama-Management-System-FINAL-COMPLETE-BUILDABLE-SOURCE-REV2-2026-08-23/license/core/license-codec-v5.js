(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const C = CL.constants;
  const PK = C.PK_ALPHABET;

  function normalizeKey(key) {
    const base = (key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (base.startsWith(C.V5_MAGIC) && base.length >= 10) {
      const seg2 = base.slice(5, 10);
      if (/^P\d{2}/.test(seg2) || /^CP\d{3}/.test(seg2)) {
        return base;
      }
    }
    return base.replace(/[^A-Z2-9]/g, '');
  }

  function formatKey25(raw25) {
    return raw25.match(/.{1,5}/g).join('-');
  }

  function daysSinceEpoch(d) {
    const iso = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
    return Math.floor((new Date(iso + 'T00:00:00Z') - C.V4_EPOCH) / 86400000);
  }

  function daysToISO(days) {
    const dt = new Date(C.V4_EPOCH);
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function encode75Bits(bits75) {
    let out = '';
    for (let i = 0; i < 15; i++) {
      const shift = BigInt(70 - i * 5);
      const idx = Number((bits75 >> shift) & 0x1Fn);
      out += PK[idx];
    }
    return out;
  }

  function decode75Bits(chars15) {
    let bits = 0n;
    for (let i = 0; i < chars15.length; i++) {
      const idx = PK.indexOf(chars15[i]);
      if (idx < 0) throw new Error('invalid_char');
      bits = (bits << 5n) | BigInt(idx);
    }
    return bits;
  }

  function packV5Bits({ mac29, actionId, subscriptionId, devices, branches, deviceHash, licenseSeq, expiryDays, flags }) {
    return (BigInt(flags & 0x3) << 73n)
      | (BigInt(expiryDays & 0x1FFF) << 60n)
      | (BigInt(licenseSeq & 0xFFFF) << 44n)
      | (BigInt(deviceHash & 0xFF) << 36n)
      | (BigInt(branches & 0xF) << 32n)
      | (BigInt(devices & 0xF) << 28n)
      | (BigInt(subscriptionId & 0xF) << 24n)
      | (BigInt(actionId & 0x7) << 21n)
      | BigInt(mac29 & 0x1FFFFF);
  }

  function unpackV5Bits(bits75) {
    return {
      mac29: Number(bits75 & 0x1FFFFFn),
      actionId: Number((bits75 >> 21n) & 0x7n),
      subscriptionId: Number((bits75 >> 24n) & 0xFn),
      devices: Number((bits75 >> 28n) & 0xFn),
      branches: Number((bits75 >> 32n) & 0xFn),
      deviceHash: Number((bits75 >> 36n) & 0xFFn),
      licenseSeq: Number((bits75 >> 44n) & 0xFFFFn),
      expiryDays: Number((bits75 >> 60n) & 0x1FFFn),
      flags: Number((bits75 >> 73n) & 0x3n)
    };
  }

  function detectKeyVersion(norm) {
    if (!norm || !norm.startsWith(C.V5_MAGIC) || norm.length !== 25) {
      if (norm && norm.length > 25 && /^[A-Z2-9]+$/.test(norm)) return 'v3';
      return 'v4orLegacy';
    }
    const seg2 = norm.slice(5, 10);
    if (/^P\d{2}/.test(seg2)) return 'v5';
    if (/^CP\d{3}/.test(seg2)) return 'v5';
    return 'v4';
  }

  function buildSegment2(packageId, customPackageId) {
    if (customPackageId) {
      const n = String(customPackageId).replace(/\D/g, '').padStart(3, '0').slice(-3);
      const seg = 'CP' + n;
      return seg.length >= 5 ? seg.slice(0, 5) : (seg + 'AA').slice(0, 5);
    }
    const core = 'P' + String(packageId || '01').padStart(2, '0').slice(-2);
    return (core + 'AA').slice(0, 5);
  }

  function parseSegment2(seg2) {
    if (/^CP\d{3}/.test(seg2)) {
      return { packageId: '99', customPackageId: 'CP' + seg2.slice(2, 5) };
    }
    if (/^P\d{2}/.test(seg2)) {
      return { packageId: seg2.slice(1, 3), customPackageId: null };
    }
    return { packageId: '01', customPackageId: null };
  }

  function randomSeg5() {
    let s = '';
    for (let i = 0; i < 5; i++) s += PK[Math.floor(Math.random() * PK.length)];
    return s;
  }

  async function computeV5Mac(seg2, fields) {
    const msg = [
      C.V5_MAGIC, seg2,
      fields.actionId, fields.subscriptionId, fields.licenseSeq,
      fields.expiryDays, fields.devices, fields.branches,
      fields.deviceHash, fields.flags
    ].join('|');
    return CL.crypto.hmacTruncated(msg, 21);
  }

  async function encodeV5Key(opts) {
    const seg2 = buildSegment2(opts.packageId, opts.customPackageId);
    const licenseSeq = opts.licenseSeq & 0xFFFF;
    const expiryDays = daysSinceEpoch(opts.expiry) & 0x1FFF;
    const actionNum = parseInt(String(opts.actionId).replace(/\D/g, ''), 10) || 1;
    const subNum = parseInt(String(opts.subscriptionId).replace(/\D/g, ''), 10) || 5;
    const fields = {
      actionId: actionNum > 7 ? 7 : actionNum,
      subscriptionId: subNum > 15 ? 15 : subNum,
      licenseSeq,
      expiryDays,
      devices: opts.devices >= 15 ? 15 : (opts.devices | 0),
      branches: opts.branches >= 15 ? 15 : (opts.branches | 0),
      deviceHash: opts.deviceAny ? 0xFF : (opts.deviceHash & 0xFF),
      flags: opts.flags || 0
    };
    fields.mac29 = await computeV5Mac(seg2, fields);
    const bits = packV5Bits(fields);
    const raw = C.V5_MAGIC + seg2 + encode75Bits(bits);
    return {
      key: formatKey25(raw),
      seg2, fields,
      expiry: daysToISO(expiryDays),
      licenseSeq
    };
  }

  async function decodeV5Key(key) {
    const norm = normalizeKey(key);
    if (detectKeyVersion(norm) !== 'v5') return { ok: false, error: 'format' };
    const seg2 = norm.slice(5, 10);
    const data15 = norm.slice(10, 25);
    try {
      const bits = decode75Bits(data15);
      const fields = unpackV5Bits(bits);
      const expectedMac = await computeV5Mac(seg2, fields);
      if (expectedMac !== fields.mac29) return { ok: false, error: 'signature' };
      const parsed = parseSegment2(seg2);
      return {
        ok: true,
        seg2, fields, packageId: parsed.packageId, customPackageId: parsed.customPackageId,
        expiry: daysToISO(fields.expiryDays),
        licenseSeq: fields.licenseSeq
      };
    } catch {
      return { ok: false, error: 'format' };
    }
  }

  CL.codecV5 = {
    normalizeKey, formatKey25, daysSinceEpoch, daysToISO,
    detectKeyVersion, buildSegment2, parseSegment2, encodeV5Key, decodeV5Key, encode75Bits, decode75Bits
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
