/**
 * Overdue-client follow-up classification.
 * A client who has not visited since the threshold is either:
 *   - not_followed: no overdue/followup message recorded
 *   - followed: a message was sent/queued (or staff marked follow-up manually)
 */
(function (global) {
  'use strict';

  const FOLLOWUP_TYPES = ['overdue', 'followup'];

  function normalizePhone(phone) {
    return String(phone == null ? '' : phone).replace(/\D/g, '');
  }

  function isFollowupType(type) {
    return FOLLOWUP_TYPES.indexOf(String(type || '')) !== -1;
  }

  function isRecordedStatus(status) {
    const s = String(status || 'sent');
    return s === 'sent' || s === 'queued' || s === 'manual';
  }

  function findLastFollowup(messageLog, refs) {
    const list = Array.isArray(messageLog) ? messageLog : [];
    const phone = normalizePhone(refs && refs.phone);
    const clientKey = String((refs && refs.clientKey) || '');
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || !isFollowupType(m.type) || !isRecordedStatus(m.status)) continue;
      if (phone && normalizePhone(m.phone) === phone) return m;
      if (clientKey && (m.refId === 'overdue_' + clientKey || m.clientKey === clientKey)) return m;
    }
    return null;
  }

  function classifyOverdueFollowup(messageLog, refs) {
    const last = findLastFollowup(messageLog, refs || {});
    if (!last) {
      return {
        followedUp: false,
        status: 'not_followed',
        labelAr: 'لم يزر ولم تتم المتابعة',
        last: null,
      };
    }
    const via = last.channel === 'manual' ? 'تم تسجيل المتابعة يدوياً' : 'تم المتابعة وإرسال رسالة';
    return {
      followedUp: true,
      status: 'followed',
      labelAr: 'لم يزر المركز — ' + via,
      last,
    };
  }

  function daysSince(dateValue, today) {
    if (!dateValue) return null;
    const then = new Date(dateValue);
    if (Number.isNaN(then.getTime())) return null;
    const now = today instanceof Date ? today : new Date();
    return Math.floor((now.getTime() - then.getTime()) / 86400000);
  }

  function isOverdue(lastActivity, thresholdDays, today) {
    const days = daysSince(lastActivity, today);
    if (days == null) return false;
    return days > (Number(thresholdDays) || 0);
  }

  const api = {
    FOLLOWUP_TYPES,
    normalizePhone,
    findLastFollowup,
    classifyOverdueFollowup,
    daysSince,
    isOverdue,
  };

  global.OverdueFollowup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
