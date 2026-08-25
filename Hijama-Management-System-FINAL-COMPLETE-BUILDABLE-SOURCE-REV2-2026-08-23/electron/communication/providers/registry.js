const custom = require('./custom');
const jawaly = require('./4jawaly');
const taqnyat = require('./taqnyat');
const urwhats = require('./urwhats');
const imissive = require('./imissive');
const deewan = require('./deewan');
const unifonic = require('./unifonic');
const qalaama = require('./qalaama');
const zajel = require('./zajel');

const BUILTIN = {
  custom,
  '4jawaly': jawaly,
  taqnyat,
  urwhats,
  imissive,
  deewan,
  unifonic,
  qalaama,
  zajel,
};

function getProviderAdapter(slug) {
  return BUILTIN[slug] || BUILTIN.custom;
}

function listBuiltinProviders() {
  return Object.values(BUILTIN)
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
    .map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      channels: p.channels,
      defaultBaseUrl: p.defaultBaseUrl || '',
      fields: p.fields || ['baseUrl', 'apiKey', 'secret', 'senderId'],
    }));
}

module.exports = { getProviderAdapter, listBuiltinProviders, BUILTIN };
