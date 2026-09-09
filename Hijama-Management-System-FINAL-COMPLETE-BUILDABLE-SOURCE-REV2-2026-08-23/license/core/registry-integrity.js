(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const cryptoApi = CL.crypto;

  async function verifyRegistry(doc, label) {
    if (!doc || typeof doc !== 'object') throw new Error(`registry_invalid:${label}`);
    const { registrySig, ...body } = doc;
    if (!registrySig) throw new Error(`registry_sig_missing:${label}`);
    const expected = await cryptoApi.computeRegistrySig(body);
    if (registrySig !== expected) throw new Error(`registry_tampered:${label}`);
    return body;
  }

  async function signRegistry(body) {
    const registrySig = await cryptoApi.computeRegistrySig(body);
    return { ...body, registrySig };
  }

  function validatePackageInheritance(packages) {
    const byId = Object.fromEntries((packages || []).map(p => [p.id, p]));
    for (const pkg of packages || []) {
      if (!pkg.inherits) continue;
      const visited = new Set();
      let cur = pkg.inherits;
      while (cur) {
        if (visited.has(cur) || cur === pkg.id) {
          throw new Error(`circular_inheritance:${pkg.id}->${cur}`);
        }
        visited.add(cur);
        cur = byId[cur]?.inherits || null;
      }
    }
  }

  CL.registryIntegrity = { verifyRegistry, signRegistry, validatePackageInheritance };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
