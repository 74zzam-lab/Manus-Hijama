/**
 * Shared + per-type message media.
 * A pinned "shared" attachment is sent with every type; each type may add its own.
 * WhatsApp carries one media per message, so callers send the list in order.
 */
(function (global) {
  'use strict';

  const SLOTS = ['shared', 'followup', 'promo', 'appointment', 'overdue'];
  const SLOT_LABELS = {
    shared: 'مشترك لكل الأنواع',
    followup: 'متابعة',
    promo: 'عروض',
    appointment: 'تذكير موعد',
    overdue: 'تنبيه غياب',
  };

  function emptyStore() {
    const store = {};
    SLOTS.forEach(function (slot) { store[slot] = null; });
    return store;
  }

  function collectMediaList(store, type) {
    const src = store && typeof store === 'object' ? store : {};
    const list = [];
    const seen = new Set();
    function push(item, slot) {
      if (!item || typeof item !== 'object') return;
      const key = String(item.dataUrl || item.path || item.name || '').slice(0, 160);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      const copy = {};
      Object.keys(item).forEach(function (k) { copy[k] = item[k]; });
      copy.slot = slot;
      list.push(copy);
    }
    push(src.shared, 'shared');
    if (type && type !== 'shared') push(src[type], type);
    return list;
  }

  function primaryMedia(store, type) {
    const list = collectMediaList(store, type);
    return list.length ? list[list.length - 1] : null;
  }

  const api = { SLOTS, SLOT_LABELS, emptyStore, collectMediaList, primaryMedia };
  global.MessageMedia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
