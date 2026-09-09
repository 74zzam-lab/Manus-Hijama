/**
 * Device fingerprint helpers for License V6 (multi-signal, stable-ish).
 * Avoids relying on a single volatile signal (IP, MAC alone, hostname alone).
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function fnv1aHex(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  async function sha256Hex(message) {
    if (global.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    const nodeCrypto = require('crypto');
    return nodeCrypto.createHash('sha256').update(String(message)).digest('hex');
  }

  function collectBrowserSignals() {
    const nav = global.navigator || {};
    const scr = global.screen || {};
    return {
      platform: nav.platform || '',
      lang: nav.language || '',
      languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 3).join(',') : '',
      cores: nav.hardwareConcurrency || 0,
      tz: (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
      })(),
      colorDepth: scr.colorDepth || 0,
      screen: `${scr.width || 0}x${scr.height || 0}`,
      // UA family only — full UA churns with browser updates
      uaFamily: String(nav.userAgent || '').replace(/[\d.]+/g, 'x').slice(0, 120),
    };
  }

  /**
   * Merge optional Electron/main-process parts (hostname hash, userData hash, arch).
   * Do not include IP or raw MAC.
   */
  async function buildFingerprint(extraParts) {
    const browser = collectBrowserSignals();
    const extra = extraParts && typeof extraParts === 'object' ? extraParts : {};
    const parts = {
      platform: extra.platform || browser.platform,
      arch: extra.arch || '',
      hostnameHash: extra.hostnameHash || '',
      userDataHash: extra.userDataHash || '',
      lang: browser.lang,
      tz: browser.tz,
      cores: browser.cores,
      colorDepth: browser.colorDepth,
      screenClass: browser.screen,
      uaFamily: browser.uaFamily,
    };
    const material = Object.keys(parts).sort().map((k) => `${k}=${parts[k]}`).join('|');
    const full = await sha256Hex('TDW-FP-V6|' + material);
    return {
      version: 1,
      hash: full,
      shortHash: full.slice(0, 16),
      components: {
        platform: parts.platform,
        arch: parts.arch,
        tz: parts.tz,
        // component digests (not raw hostname)
        hostnameHash: parts.hostnameHash || fnv1aHex('none'),
        userDataHash: parts.userDataHash || fnv1aHex('none'),
      },
    };
  }

  /**
   * Compare fingerprints with tolerance: allow up to `maxDrift` component mismatches
   * so minor hardware/OS changes don't hard-brick activation.
   */
  function fingerprintsCompatible(stored, current, maxDrift = 2) {
    if (!stored || !current) return false;
    if (stored.hash && current.hash && stored.hash === current.hash) return true;
    if (stored.shortHash && current.shortHash && stored.shortHash === current.shortHash) return true;
    const a = stored.components || {};
    const b = current.components || {};
    const keys = ['platform', 'arch', 'tz', 'hostnameHash', 'userDataHash'];
    let drift = 0;
    for (const k of keys) {
      if (!a[k] || !b[k]) continue;
      if (String(a[k]) !== String(b[k])) drift += 1;
    }
    return drift <= maxDrift;
  }

  CL.deviceFingerprint = {
    fnv1aHex,
    sha256Hex,
    collectBrowserSignals,
    buildFingerprint,
    fingerprintsCompatible,
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
