/**
 * Client enrichment — profile defaults, smart merge, full registry structure.
 */
(function (global) {
  'use strict';

  const MI = global.MigrationIdentity || {};

  function isMapped(mapping, field) {
    return mapping && mapping[field] != null && mapping[field] >= 0;
  }

  function valOrEmpty(v) {
    if (v == null || v === '') return '';
    return v;
  }

  function defaultFileProfile(rec) {
    return {
      gender: valOrEmpty(rec.gender),
      age: valOrEmpty(rec.age),
      address: valOrEmpty(rec.address),
      purpose: '',
      bloodThinners: null,
      tempConditions: '',
      chronicConditions: '',
      bloodPressure: '',
      bloodSugar: '',
      pregnancy: null,
      allergies: valOrEmpty(rec.allergies),
      symptoms: valOrEmpty(rec.symptoms),
      prevCupping: null,
      hepatitisB: null,
      hepatitisC: null,
      heartDisease: null,
      hiv: null,
      anemia: null,
      kidneyDisease: null,
      emergencyContact: valOrEmpty(rec.emergencyContact),
      usedPoints: [],
      savedPoints: []
    };
  }

  function mergeProfile(existing, incoming, strategy) {
    const out = Object.assign({}, existing || defaultFileProfile({}));
    if (!incoming) return out;
    Object.keys(incoming).forEach(k => {
      const v = incoming[k];
      if (v == null || v === '') return;
      if (strategy === 'replace') {
        out[k] = v;
      } else if (strategy === 'fill_empty' || strategy === 'update' || strategy === 'merge') {
        if (out[k] == null || out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) out[k] = v;
        else if (strategy === 'merge' && typeof v === 'string' && v !== out[k]) out[k] = v;
      }
    });
    return out;
  }

  function profileFromRecord(rec, mapping) {
    const p = defaultFileProfile(rec);
    if (!mapping) return p;
    if (isMapped(mapping, 'gender')) p.gender = valOrEmpty(rec.gender);
    if (isMapped(mapping, 'age')) p.age = valOrEmpty(rec.age);
    if (isMapped(mapping, 'address')) p.address = valOrEmpty(rec.address);
    if (isMapped(mapping, 'allergies')) p.allergies = valOrEmpty(rec.allergies);
    if (isMapped(mapping, 'symptoms')) p.symptoms = valOrEmpty(rec.symptoms);
    if (isMapped(mapping, 'emergencyContact')) p.emergencyContact = valOrEmpty(rec.emergencyContact);
    if (isMapped(mapping, 'notes') && rec.notes) p.purpose = valOrEmpty(rec.notes);
    return p;
  }

  function mergeClientRecord(client, rec, strategy, mapping) {
    if (!client || !rec) return client;
    const apply = (field, targetField) => {
      if (!isMapped(mapping, field)) return;
      const val = rec[field];
      const key = targetField || field;
      if (strategy === 'replace') {
        client[key] = val != null ? val : '';
      } else if (strategy === 'fill_empty') {
        if ((client[key] == null || client[key] === '') && val) client[key] = val;
      } else if (strategy === 'merge' || strategy === 'update') {
        if (val) client[key] = val;
      }
    };

    apply('name');
    apply('phone');
    apply('patientId');
    apply('nationality');
    apply('email');
    apply('address');
    apply('birthDate');
    apply('branch');
    apply('source');
    apply('status');

    if (isMapped(mapping, 'tags') && rec.tags) {
      const incoming = String(rec.tags).split(/[,،;|]/).map(t => t.trim()).filter(Boolean);
      const existing = Array.isArray(client.tags) ? client.tags : [];
      if (strategy === 'replace') client.tags = incoming;
      else client.tags = [...new Set([...existing, ...incoming])];
    }

    const incomingProfile = profileFromRecord(rec, mapping);
    client.fileProfile = mergeProfile(client.fileProfile, incomingProfile, strategy === 'update' ? 'fill_empty' : strategy);
    client.updatedAt = new Date().toISOString();
    return client;
  }

  function ensureClientStructure(client, rec, mapping) {
    if (!client.key || client.key.startsWith('ph:') || client.key.startsWith('nm:')) {
      if (typeof global.makeClientRegistryKey === 'function') client.key = global.makeClientRegistryKey(client.id);
    }
    if (!client.defaultInvoiceType) client.defaultInvoiceType = 'normal';
    if (client.isVip == null) client.isVip = false;
    if (!client.fileProfile) client.fileProfile = profileFromRecord(rec || {}, mapping);
    if (!client.createdAt) client.createdAt = new Date().toISOString();
    client.updatedAt = new Date().toISOString();
    if (rec?.email && !client.email) client.email = rec.email;
    if (rec?.address && !client.address) client.address = rec.address;
    if (rec?.birthDate && !client.birthDate) client.birthDate = rec.birthDate;
    return client;
  }

  function registerClientInIndexes(client, indexes) {
    if (!client || !indexes) return;
    const p = MI.normPhone ? MI.normPhone(client.phone) : String(client.phone || '').replace(/\D/g, '');
    const n = MI.normName ? MI.normName(client.name).toLowerCase() : String(client.name || '').toLowerCase();
    if (p) {
      indexes.phones.add(p);
      indexes.clientByPhoneName.set(`${p}|${n}`, client);
      if (!indexes.clientByPhone.has(p)) indexes.clientByPhone.set(p, []);
      if (!indexes.clientByPhone.get(p).some(c => c.id === client.id)) indexes.clientByPhone.get(p).push(client);
    }
    if (client.patientId) indexes.clientByPid.set(String(client.patientId).trim(), client);
    if (client.fileNo) indexes.clientByFileNo.set(String(client.fileNo).trim().toUpperCase(), client);
    if (client.id) indexes.clientsById.set(client.id, client);
  }

  global.MigrationClient = {
    isMapped, defaultFileProfile, profileFromRecord, mergeClientRecord,
    ensureClientStructure, registerClientInIndexes, mergeProfile
  };
})(typeof window !== 'undefined' ? window : globalThis);
