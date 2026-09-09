/**
 * Cross-page bulk selection for client-message lists.
 * "Select page" touches the visible page; "Select all clients" uses the full filtered set.
 */
(function (global) {
  'use strict';

  function phoneKey(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function createSelection() {
    const selected = new Map();

    function add(row) {
      if (!row) return false;
      const key = phoneKey(row.phone);
      if (!key) return false;
      selected.set(key, {
        phone: row.phone,
        name: row.name || '',
        lastDate: row.lastDate || '',
        key: row.key || '',
      });
      return true;
    }

    function remove(phone) {
      selected.delete(phoneKey(phone));
    }

    function has(phone) {
      return selected.has(phoneKey(phone));
    }

    function clear() {
      selected.clear();
    }

    function addAll(rows) {
      (rows || []).forEach(add);
    }

    function toggle(row, checked) {
      if (checked) add(row);
      else remove(row && row.phone);
    }

    function values() {
      return Array.from(selected.values());
    }

    function size() {
      return selected.size;
    }

    function pageState(visibleRows) {
      const rows = (visibleRows || []).filter(function (r) { return phoneKey(r.phone); });
      if (!rows.length) return { all: false, some: false };
      const checked = rows.filter(function (r) { return has(r.phone); }).length;
      return { all: checked === rows.length, some: checked > 0 && checked < rows.length };
    }

    return { add, remove, has, clear, addAll, toggle, values, size, phoneKey, pageState };
  }

  const api = { phoneKey, createSelection };
  global.BulkSelect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
