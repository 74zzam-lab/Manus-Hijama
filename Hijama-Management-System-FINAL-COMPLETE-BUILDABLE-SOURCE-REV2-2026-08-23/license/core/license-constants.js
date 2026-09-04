(function (global) {
  'use strict';

  const CommercialLicense = global.CommercialLicense || {};
  CommercialLicense.constants = {
    V4_MAGIC: 'TDWI2',
    V5_MAGIC: 'TDWI2',
    PK_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    V4_EPOCH: new Date('2020-01-01T00:00:00Z'),
    STORAGE_KEY: 'commercial_license_data_v2',
    REGISTRY_BASE: 'license/registries/',
    DATA_BASE: 'license/data/',
    OPT_IN_FEATURE_IDS: ['060', '063', '064', '066'],
    SUBSCRIPTION_DAYS: {
      '01': 7, '02': 30, '03': 90, '04': 180, '05': 365,
      '06': 730, '07': 1095, '08': null, '09': null
    },
    V4_TYPE_IDX: { trial: 0, monthly: 1, quarterly: 2, biannual: 3, annual: 4, custom: 5, renew: 6 },
    SUB_TO_V1: {
      '01': 'trial', '02': 'monthly', '03': 'quarterly', '04': 'biannual',
      '05': 'annual', '06': 'annual', '07': 'annual', '08': 'custom', '09': 'custom'
    }
  };
  global.CommercialLicense = CommercialLicense;
})(typeof window !== 'undefined' ? window : global);
