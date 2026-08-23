/* ═══════════════════════════════════════════════════════════
   Cupping Center Platform — local date, day rollover, login theme
   ═══════════════════════════════════════════════════════════ */

function formatDateISO(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getAppNow() {
  return new Date();
}

function getTodayISO() {
  return formatDateISO(getAppNow());
}

let _lastKnownAppDate = null;
let _dayRolloverTimer = null;

function onAppDayChanged(prevDay, newDay) {
  if (typeof updateTopbarClock === 'function') updateTopbarClock();
  const todayISO = newDay;
  ['ot-date', 'att-date', 'bk-date', 'exp-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el && (!el.value || el.value === prevDay)) el.value = todayISO;
  });
  const fDate = document.getElementById('f-date');
  if (fDate && fDate.value === prevDay) fDate.value = todayISO;
  if (typeof refreshDashboard === 'function') refreshDashboard();
  if (typeof refreshDailyTable === 'function') refreshDailyTable();
  if (typeof refreshBookingsTable === 'function') refreshBookingsTable();
  if (typeof refreshDashboardAlerts === 'function') refreshDashboardAlerts();
  if (typeof refreshExpenses === 'function') refreshExpenses();
  if (typeof luxQueueOnDayChanged === 'function') luxQueueOnDayChanged(newDay);
  if (typeof logAudit === 'function') {
    logAudit('SETTINGS_CHANGED', `بداية يوم جديد: ${newDay}`, { prevDay, newDay });
  }
}

function checkAppDayRollover() {
  const today = getTodayISO();
  if (_lastKnownAppDate && _lastKnownAppDate !== today) {
    onAppDayChanged(_lastKnownAppDate, today);
  }
  _lastKnownAppDate = today;
}

function initAppClock() {
  checkAppDayRollover();
  if (!_dayRolloverTimer) {
    _dayRolloverTimer = setInterval(checkAppDayRollover, 60000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAppDayRollover();
  });
}

function loadColorSchemeSilent() {
  if (typeof applyTheme !== 'function' || typeof settings === 'undefined') return;
  const theme = settings.colorScheme || (typeof DEFAULT_THEME !== 'undefined' ? DEFAULT_THEME : 'clinical-blue');
  applyTheme(theme, { silent: true });
}

async function fetchNetworkTimeQuick(timeoutMs) {
  const ms = timeoutMs || 2500;
  if (typeof licFetchRealTime !== 'function') return null;
  return Promise.race([
    licFetchRealTime(),
    new Promise(resolve => setTimeout(() => resolve(null), ms))
  ]);
}
