/**
 * Shared + per-type message media.
 * Each slot holds an array of attachments; shared items are sent first, then type-specific.
 * WhatsApp carries one media per message — callers send the list in order.
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
  const MAX_PER_SLOT = 5;

  function emptyStore() {
    const store = {};
    SLOTS.forEach(function (slot) { store[slot] = []; });
    return store;
  }

  function normalizeSlotItems(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
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
    normalizeSlotItems(src.shared).forEach(function (item) { push(item, 'shared'); });
    if (type && type !== 'shared') {
      normalizeSlotItems(src[type]).forEach(function (item) { push(item, type); });
    }
    return list;
  }

  function primaryMedia(store, type) {
    const list = collectMediaList(store, type);
    return list.length ? list[list.length - 1] : null;
  }

  const api = { SLOTS, SLOT_LABELS, MAX_PER_SLOT, emptyStore, normalizeSlotItems, collectMediaList, primaryMedia };
  global.MessageMedia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
