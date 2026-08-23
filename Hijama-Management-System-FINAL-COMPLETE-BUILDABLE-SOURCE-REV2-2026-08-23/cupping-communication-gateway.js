/* ═══════════════════════════════════════════════════════════
   Communication Gateway — Providers, Queue, Templates, UI
   ═══════════════════════════════════════════════════════════ */

const COMM_BUILTIN_LABELS = {
  '4jawaly': '4jawaly — فورجوالي',
  taqnyat: 'Taqnyat — تقنيات',
  urwhats: 'urWhats',
  imissive: 'iMissive',
  deewan: 'Deewan — ديوان',
  unifonic: 'Unifonic — يونيفونيك',
  qalaama: 'Qalaama — قلامة',
  zajel: 'Zajel AI — زاجل',
  custom: 'API مخصص',
  manual: 'يدوي (wa.me / SMS)',
};

const defaultCommunicationTemplates = {
  booking: {
    whatsapp: 'مرحباً {name}، تم تأكيد حجزك في {center} بتاريخ {date} الساعة {time}.',
    sms: 'حجز مؤكد {center} {date} {time}',
  },
  reminder: {
    whatsapp: 'تذكير: موعدك غداً {date} الساعة {time} — {center}',
    sms: 'تذكير موعد {date} {time}',
  },
  otp: {
    whatsapp: 'رمز التحقق: {code} — {center}',
    sms: 'OTP: {code}',
  },
  loyalty: {
    whatsapp: 'مرحباً {name}، لديك {points} نقطة ولاء في {center}.',
    sms: 'نقاط الولاء: {points}',
  },
};

const defaultCommunicationConfig = {
  activeProviders: { whatsapp: '', sms: '', email: '', otp: '' },
  webhookPort: 17890,
  webhookSecret: '',
  queue: { enabled: true, batchSize: 5, delayMs: 400 },
  templates: JSON.parse(JSON.stringify(defaultCommunicationTemplates)),
  providers: [],
  integrations: {
    payment: { enabled: false, provider: '', config: {} },
    email: { enabled: false, provider: '', config: {} },
    calendar: { enabled: false, provider: '', config: {} },
    invoices: { enabled: false, provider: '', config: {} },
  },
};

let commProviderEditId = null;
let commBuiltinList = [];

function getCommElectron() {
  return window.cuppingElectron || window.tadawiElectron || null;
}

function getCommunicationConfigPayload() {
  ensureCommunicationSettings();
  return { communication: settings.communication };
}

function ensureCommunicationSettings() {
  if (typeof ensureExtSettings === 'function') ensureExtSettings();
  if (!settings.communication) {
    settings.communication = JSON.parse(JSON.stringify(defaultCommunicationConfig));
  } else {
    settings.communication = {
      ...JSON.parse(JSON.stringify(defaultCommunicationConfig)),
      ...settings.communication,
      queue: { ...defaultCommunicationConfig.queue, ...(settings.communication.queue || {}) },
      templates: { ...defaultCommunicationTemplates, ...(settings.communication.templates || {}) },
      activeProviders: { ...defaultCommunicationConfig.activeProviders, ...(settings.communication.activeProviders || {}) },
      integrations: { ...defaultCommunicationConfig.integrations, ...(settings.communication.integrations || {}) },
      providers: settings.communication.providers || [],
    };
  }
  migrateMessagingApiToCommunication();
}

function migrateMessagingApiToCommunication() {
  const legacy = settings.messagingApi;
  if (!legacy) return;
  const hasProviders = (settings.communication.providers || []).length > 0;
  if (hasProviders) return;
  const migrated = [];
  if (legacy.whatsapp?.apiUrl || legacy.whatsapp?.apiKey) {
    migrated.push({
      id: 'legacy_wa_' + Date.now(),
      slug: legacy.whatsapp.provider === 'manual' ? 'custom' : (legacy.whatsapp.provider || 'custom'),
      name: 'WhatsApp (Legacy)',
      enabled: true,
      baseUrl: legacy.whatsapp.apiUrl || '',
      apiKey: legacy.whatsapp.apiKey || '',
      secret: '',
      senderId: legacy.whatsapp.senderId || '',
      channels: ['whatsapp'],
    });
  }
  if (legacy.sms?.apiUrl || legacy.sms?.apiKey) {
    migrated.push({
      id: 'legacy_sms_' + Date.now(),
      slug: legacy.sms.provider === 'manual' ? 'custom' : (legacy.sms.provider || 'custom'),
      name: 'SMS (Legacy)',
      enabled: true,
      baseUrl: legacy.sms.apiUrl || '',
      apiKey: legacy.sms.apiKey || '',
      secret: '',
      senderId: legacy.sms.senderId || '',
      channels: ['sms'],
    });
  }
  if (migrated.length) {
    settings.communication.providers = migrated;
    if (migrated[0]) settings.communication.activeProviders.whatsapp = migrated[0].id;
    if (migrated[1]) settings.communication.activeProviders.sms = migrated[1].id;
    else if (migrated[0]?.channels?.includes('sms')) settings.communication.activeProviders.sms = migrated[0].id;
  }
}

function applyTemplate(templateKey, channel, vars) {
  ensureCommunicationSettings();
  const tpl = settings.communication.templates?.[templateKey]?.[channel] ||
    settings.communication.templates?.[templateKey]?.whatsapp || '';
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

async function initCommunicationGateway() {
  ensureCommunicationSettings();
  const api = getCommElectron();
  if (!api?.communication) return;
  await api.communication.init(getCommunicationConfigPayload());
  api.communication.onWebhook(handleCommWebhookEvent);
  api.communication.onQueueUpdate(() => refreshCommQueueUI());
}

function handleCommWebhookEvent(event) {
  const log = DB.get('communicationWebhookLog', []);
  log.unshift(event);
  if (log.length > 200) log.length = 200;
  DB.set('communicationWebhookLog', log);
  if (event?.payload?.message_id || event?.payload?.status) {
    updateMessageLogFromWebhook(event.payload);
  }
  refreshCommWebhookLogUI();
}

function updateMessageLogFromWebhook(payload) {
  const mid = payload.message_id || payload.messageId;
  const status = payload.status || payload.delivery_status;
  if (!mid || !status) return;
  messageLog = DB.get('messageLog', messageLog || []);
  const entry = messageLog.find((m) => m.messageId === mid);
  if (entry) {
    entry.deliveryStatus = status;
    entry.status = status === 'delivered' || status === 'read' ? 'delivered' : entry.status;
    DB.set('messageLog', messageLog);
    if (typeof refreshMessageLog === 'function') refreshMessageLog(false);
  }
}

async function loadCommunicationSettingsUI() {
  ensureCommunicationSettings();
  const api = getCommElectron();
  if (api?.communication?.listProviders) {
    try { commBuiltinList = await api.communication.listProviders(); } catch { commBuiltinList = []; }
  }
  renderCommProvidersList();
  renderCommActiveProviderSelects();
  loadCommTemplatesUI();
  loadCommIntegrationsUI();
  refreshCommStatusUI();
  refreshCommQueueUI();
  refreshCommWebhookLogUI();
  initCommunicationGateway();
}

function loadCommTemplatesUI() {
  ensureCommunicationSettings();
  const t = settings.communication.templates || {};
  ['booking', 'reminder', 'otp', 'loyalty'].forEach((key) => {
    const wa = document.getElementById('comm-tpl-' + key + '-wa');
    const sms = document.getElementById('comm-tpl-' + key + '-sms');
    if (wa) wa.value = t[key]?.whatsapp || '';
    if (sms) sms.value = t[key]?.sms || '';
  });
}

function saveCommTemplates() {
  if (typeof requirePermission === 'function' && !requirePermission('settings.edit', 'حفظ القوالب')) return;
  ensureCommunicationSettings();
  ['booking', 'reminder', 'otp', 'loyalty'].forEach((key) => {
    if (!settings.communication.templates[key]) settings.communication.templates[key] = {};
    settings.communication.templates[key].whatsapp = document.getElementById('comm-tpl-' + key + '-wa')?.value.trim() || '';
    settings.communication.templates[key].sms = document.getElementById('comm-tpl-' + key + '-sms')?.value.trim() || '';
  });
  DB.set('settings', settings);
  notify('✅ تم حفظ قوالب الرسائل');
}

function loadCommIntegrationsUI() {
  ensureCommunicationSettings();
  const ints = settings.communication.integrations || {};
  ['payment', 'email', 'calendar', 'invoices'].forEach((k) => {
    const en = document.getElementById('comm-int-' + k + '-enabled');
    const prov = document.getElementById('comm-int-' + k + '-provider');
    if (en) en.checked = !!ints[k]?.enabled;
    if (prov) prov.value = ints[k]?.provider || '';
  });
  const qEn = document.getElementById('comm-queue-enabled');
  const qBatch = document.getElementById('comm-queue-batch');
  const qDelay = document.getElementById('comm-queue-delay');
  const whPort = document.getElementById('comm-webhook-port');
  const whSec = document.getElementById('comm-webhook-secret');
  if (qEn) qEn.checked = settings.communication.queue?.enabled !== false;
  if (qBatch) qBatch.value = settings.communication.queue?.batchSize ?? 5;
  if (qDelay) qDelay.value = settings.communication.queue?.delayMs ?? 400;
  if (whPort) whPort.value = settings.communication.webhookPort ?? 17890;
  if (whSec) whSec.value = settings.communication.webhookSecret || '';
}

function saveCommunicationSettings() {
  if (typeof requirePermission === 'function' && !requirePermission('settings.edit', 'حفظ التكاملات')) return;
  ensureCommunicationSettings();
  settings.communication.activeProviders.whatsapp = document.getElementById('comm-active-wa')?.value || '';
  settings.communication.activeProviders.sms = document.getElementById('comm-active-sms')?.value || '';
  settings.communication.queue.enabled = !!document.getElementById('comm-queue-enabled')?.checked;
  settings.communication.queue.batchSize = parseInt(document.getElementById('comm-queue-batch')?.value, 10) || 5;
  settings.communication.queue.delayMs = parseInt(document.getElementById('comm-queue-delay')?.value, 10) || 400;
  settings.communication.webhookPort = parseInt(document.getElementById('comm-webhook-port')?.value, 10) || 17890;
  settings.communication.webhookSecret = document.getElementById('comm-webhook-secret')?.value.trim() || '';
  ['payment', 'email', 'calendar', 'invoices'].forEach((k) => {
    settings.communication.integrations[k].enabled = !!document.getElementById('comm-int-' + k + '-enabled')?.checked;
    settings.communication.integrations[k].provider = document.getElementById('comm-int-' + k + '-provider')?.value.trim() || '';
  });
  DB.set('settings', settings);
  saveCommTemplates();
  initCommunicationGateway();
  if (typeof updateMessagingBridgeStatus === 'function') updateMessagingBridgeStatus();
  notify('✅ تم حفظ إعدادات التكاملات');
}

function renderCommProvidersList() {
  const el = document.getElementById('comm-providers-list');
  if (!el) return;
  ensureCommunicationSettings();
  const list = settings.communication.providers || [];
  if (!list.length) {
    el.innerHTML = '<div style="padding:16px;color:var(--text-light);font-size:13px;text-align:center">لا يوجد مزود — اضغط «إضافة مزود»</div>';
    return;
  }
  const ab = typeof actionBtn === 'function' ? actionBtn : (icon, label, opts) => {
    opts = opts || {};
    const cls = opts.cls || 'btn-ghost';
    const onclick = opts.onclick ? ` onclick="${opts.onclick}"` : '';
    return `<button type="button" class="btn ${cls} btn-sm btn-action" title="${label}"${onclick}><span class="btn-ico">${icon}</span><span class="btn-lbl">${label}</span></button>`;
  };
  const abr = typeof actionBtnRow === 'function' ? actionBtnRow : (h) => `<div class="table-action-btns">${h}</div>`;
  el.innerHTML = list.map((p) => {
    const ch = (p.channels || []).map((c) => ({ whatsapp: '💬', sms: '📱', otp: '🔐', email: '📧' }[c] || c)).join(' ');
    const slugLabel = COMM_BUILTIN_LABELS[p.slug] || p.slug;
    return `<div class="comm-provider-card">
      <div class="comm-provider-card-head">
        <div><strong>${p.name || slugLabel}</strong> <span style="font-size:11px;color:var(--text-muted)">${slugLabel}</span></div>
        <span class="tag ${p.enabled !== false ? 'tag-green' : 'tag-gray'}">${p.enabled !== false ? 'مفعّل' : 'موقوف'}</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin:6px 0">${ch} ${p.senderId ? '• ' + p.senderId : ''}</div>
      <div>${abr(
        ab('✏️', 'تعديل', { onclick: `openCommProviderModal('${p.id}')` }) +
        ab('🔌', 'اختبار', { cls: 'btn-accent', onclick: `testCommProviderById('${p.id}')` }) +
        ab('🗑️', 'حذف', { cls: 'btn-danger', onclick: `deleteCommProvider('${p.id}')` })
      )}</div>
    </div>`;
  }).join('');
}

function renderCommActiveProviderSelects() {
  ensureCommunicationSettings();
  const list = settings.communication.providers || [];
  const opts = '<option value="">— يدوي / deeplink —</option>' +
    list.map((p) => `<option value="${p.id}">${p.name || p.slug}${p.enabled === false ? ' (موقوف)' : ''}</option>`).join('');
  ['comm-active-wa', 'comm-active-sms'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = opts;
    el.value = id === 'comm-active-wa'
      ? (settings.communication.activeProviders.whatsapp || '')
      : (settings.communication.activeProviders.sms || '');
  });
}

function openCommProviderModal(id) {
  commProviderEditId = id || null;
  ensureCommunicationSettings();
  const modal = document.getElementById('commProviderModal');
  const slugSel = document.getElementById('comm-prov-slug');
  if (slugSel && commBuiltinList.length) {
    slugSel.innerHTML = commBuiltinList.map((b) =>
      `<option value="${b.id}">${COMM_BUILTIN_LABELS[b.id] || b.nameAr || b.name}</option>`
    ).join('') + '<option value="manual">يدوي (wa.me / SMS)</option>';
  }
  const p = id ? settings.communication.providers.find((x) => x.id === id) : null;
  document.getElementById('comm-prov-name').value = p?.name || '';
  if (slugSel) slugSel.value = p?.slug || 'custom';
  document.getElementById('comm-prov-base').value = p?.baseUrl || '';
  document.getElementById('comm-prov-key').value = p?.apiKey || '';
  document.getElementById('comm-prov-secret').value = p?.secret || '';
  document.getElementById('comm-prov-sender').value = p?.senderId || '';
  document.getElementById('comm-prov-sendpath').value = p?.sendPath || '/send';
  document.getElementById('comm-prov-enabled').checked = p?.enabled !== false;
  ['whatsapp', 'sms', 'otp', 'email'].forEach((ch) => {
    const c = document.getElementById('comm-prov-ch-' + ch);
    if (c) c.checked = p ? (p.channels || []).includes(ch) : ch === 'whatsapp' || ch === 'sms';
  });
  onCommProviderSlugChange();
  if (modal) modal.classList.add('open');
}

function closeCommProviderModal() {
  document.getElementById('commProviderModal')?.classList.remove('open');
  commProviderEditId = null;
}

function onCommProviderSlugChange() {
  const slug = document.getElementById('comm-prov-slug')?.value || 'custom';
  const builtin = commBuiltinList.find((b) => b.id === slug);
  const baseEl = document.getElementById('comm-prov-base');
  if (baseEl && builtin?.defaultBaseUrl && !baseEl.value) baseEl.placeholder = builtin.defaultBaseUrl;
}

function saveCommProviderModal() {
  if (typeof requirePermission === 'function' && !requirePermission('settings.edit', 'إدارة المزودين')) return;
  ensureCommunicationSettings();
  const channels = ['whatsapp', 'sms', 'otp', 'email'].filter((ch) =>
    document.getElementById('comm-prov-ch-' + ch)?.checked);
  const entry = {
    id: commProviderEditId || ('prov_' + Date.now()),
    slug: document.getElementById('comm-prov-slug')?.value || 'custom',
    name: document.getElementById('comm-prov-name')?.value.trim() || '',
    baseUrl: document.getElementById('comm-prov-base')?.value.trim() || '',
    apiKey: document.getElementById('comm-prov-key')?.value.trim() || '',
    secret: document.getElementById('comm-prov-secret')?.value.trim() || '',
    senderId: document.getElementById('comm-prov-sender')?.value.trim() || '',
    sendPath: document.getElementById('comm-prov-sendpath')?.value.trim() || '/send',
    enabled: !!document.getElementById('comm-prov-enabled')?.checked,
    channels,
  };
  if (!entry.name) {
    const b = commBuiltinList.find((x) => x.id === entry.slug);
    entry.name = b?.nameAr || b?.name || entry.slug;
  }
  const idx = settings.communication.providers.findIndex((x) => x.id === entry.id);
  if (idx >= 0) settings.communication.providers[idx] = entry;
  else settings.communication.providers.push(entry);
  DB.set('settings', settings);
  closeCommProviderModal();
  renderCommProvidersList();
  renderCommActiveProviderSelects();
  notify('✅ تم حفظ المزود');
}

function deleteCommProvider(id) {
  if (!confirm('حذف هذا المزود؟')) return;
  ensureCommunicationSettings();
  settings.communication.providers = settings.communication.providers.filter((p) => p.id !== id);
  Object.keys(settings.communication.activeProviders).forEach((k) => {
    if (settings.communication.activeProviders[k] === id) settings.communication.activeProviders[k] = '';
  });
  DB.set('settings', settings);
  renderCommProvidersList();
  renderCommActiveProviderSelects();
  notify('🗑️ تم الحذف', 'danger');
}

async function testCommProviderById(id) {
  ensureCommunicationSettings();
  const p = settings.communication.providers.find((x) => x.id === id);
  if (!p) return;
  await testCommProviderObject(p);
}

async function testCommProviderModal() {
  const p = {
    slug: document.getElementById('comm-prov-slug')?.value || 'custom',
    baseUrl: document.getElementById('comm-prov-base')?.value.trim() || '',
    apiKey: document.getElementById('comm-prov-key')?.value.trim() || '',
    secret: document.getElementById('comm-prov-secret')?.value.trim() || '',
    senderId: document.getElementById('comm-prov-sender')?.value.trim() || '',
    sendPath: document.getElementById('comm-prov-sendpath')?.value.trim() || '/send',
  };
  await testCommProviderObject(p);
}

async function testCommProviderObject(p) {
  const api = getCommElectron();
  const el = document.getElementById('comm-test-result');
  if (el) el.textContent = 'جارٍ الاختبار...';
  if (p.slug === 'manual') {
    if (el) el.textContent = '✅ الوضع اليدوي — يفتح wa.me / SMS';
    notify('✅ الوضع اليدوي جاهز');
    return;
  }
  if (api?.communication?.testProvider) {
    const res = await api.communication.testProvider(p);
    const msg = res?.ok ? '✅ ' + (res.message || 'نجح الاتصال') : '❌ ' + (res.message || 'فشل');
    if (el) el.textContent = msg;
    notify(msg, res?.ok ? 'success' : 'danger');
    return;
  }
  if (el) el.textContent = '⚠️ يتطلب تطبيق Electron للاختبار الكامل';
  notify('⚠️ اختبار API يتطلب Electron', 'danger');
}

async function refreshCommStatusUI() {
  const el = document.getElementById('comm-gateway-status');
  const wh = document.getElementById('comm-webhook-url');
  if (!el) return;
  ensureCommunicationSettings();
  const api = getCommElectron();
  let st = null;
  if (api?.communication?.getStatus) {
    try { st = await api.communication.getStatus(getCommunicationConfigPayload()); } catch { /* */ }
  }
  if (!st && typeof MessagingBridge !== 'undefined') {
    st = await MessagingBridge.getStatus();
  }
  const mode = api ? 'Electron Gateway' : 'متصفح';
  const waMode = st?.whatsapp?.mode || '—';
  const smsMode = st?.sms?.mode || '—';
  const pending = st?.queue?.pending ?? 0;
  const sent = st?.queue?.sent ?? 0;
  const setKpi = (id, val, badgeId, badgeText, badgeCls) => {
    const v = document.getElementById(id);
    const b = badgeId ? document.getElementById(badgeId) : null;
    if (v) v.textContent = val;
    if (b) { b.textContent = badgeText; b.className = 'lic-gw-kpi-badge ' + (badgeCls || 'warn'); }
  };
  setKpi('lic-gw-kpi-wa', waMode, 'lic-gw-kpi-wa-badge', st?.whatsapp?.provider || 'غير مفعّل', waMode !== '—' ? 'ok' : 'warn');
  setKpi('lic-gw-kpi-sms', smsMode, 'lic-gw-kpi-sms-badge', st?.sms?.provider || 'غير مفعّل', smsMode !== '—' ? 'ok' : 'warn');
  setKpi('lic-gw-kpi-queue', String(pending), 'lic-gw-kpi-queue-badge', pending ? 'معلّق' : 'فارغ', pending ? 'warn' : 'ok');
  setKpi('lic-gw-kpi-env', mode === 'Electron Gateway' ? 'Electron' : 'متصفح', 'lic-gw-kpi-env-badge', 'Gateway', 'ok');
  el.innerHTML = st ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
      <div><strong>البيئة:</strong> ${mode}</div>
      <div><strong>واتساب:</strong> ${waMode} ${st.whatsapp?.provider ? '(' + st.whatsapp.provider + ')' : ''}</div>
      <div><strong>SMS:</strong> ${smsMode} ${st.sms?.provider ? '(' + st.sms.provider + ')' : ''}</div>
      <div><strong>طابور:</strong> ${pending} معلّق / ${sent} مُرسل</div>
    </div>
  ` : '—';
  if (wh && st?.webhookUrl) wh.textContent = st.webhookUrl;
}

async function refreshCommQueueUI() {
  const el = document.getElementById('comm-queue-list');
  const stat = document.getElementById('comm-queue-stats');
  if (!el) return;
  const api = getCommElectron();
  let items = [];
  let qst = { pending: 0, sent: 0, failed: 0 };
  if (api?.communication?.getQueue) {
    try {
      items = await api.communication.getQueue();
      const st = await api.communication.getStatus(getCommunicationConfigPayload());
      qst = st?.queue || qst;
    } catch { /* */ }
  } else {
    items = DB.get('communicationQueue', []).slice(0, 50);
    qst.pending = items.filter((i) => i.status === 'pending').length;
  }
  if (stat) stat.textContent = `معلّق: ${qst.pending} | مُرسل: ${qst.sent || 0} | فشل: ${qst.failed || 0}`;
  if (!items.length) {
    el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-light)">الطابور فارغ</td></tr>';
    return;
  }
  el.innerHTML = items.map((i) => `<tr>
    <td class="col-date">${(i.createdAt || i.at || '').slice(0, 16).replace('T', ' ')}</td>
    <td>${i.channel || '—'}</td>
    <td dir="ltr">${i.phone || '—'}</td>
    <td><span class="tag tag-${i.status === 'sent' ? 'green' : i.status === 'failed' ? 'red' : 'gold'}">${i.status}</span></td>
    <td style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis">${(i.message || '').slice(0, 60)}</td>
  </tr>`).join('');
}

function refreshCommWebhookLogUI() {
  const el = document.getElementById('comm-webhook-log');
  if (!el) return;
  const log = DB.get('communicationWebhookLog', []);
  if (!log.length) {
    el.innerHTML = '<div style="padding:12px;color:var(--text-light);font-size:12px">لا أحداث webhook بعد</div>';
    return;
  }
  el.innerHTML = log.slice(0, 15).map((e) =>
    `<div class="comm-webhook-item"><span>${e.at?.slice(0, 19).replace('T', ' ')}</span> <code style="font-size:10px">${JSON.stringify(e.payload || {}).slice(0, 120)}</code></div>`
  ).join('');
}

async function processCommQueueNow() {
  ensureCommunicationSettings();
  const api = getCommElectron();
  if (!api?.communication?.processQueue) {
    notify('⚠️ ' + (typeof CommercialLicense?.developerPanel?.ELECTRON_ONLY_MSG_AR === 'string'
      ? CommercialLicense.developerPanel.ELECTRON_ONLY_MSG_AR
      : 'هذه الوظيفة متاحة فقط في تطبيق Electron لسطح المكتب.'), 'warning');
    return;
  }
  const res = await api.communication.processQueue(getCommunicationConfigPayload());
  notify(res?.processed ? `✅ تم إرسال ${res.processed} من الطابور` : 'ℹ️ لا رسائل في الطابور');
  refreshCommQueueUI();
  refreshCommStatusUI();
}

async function clearCommQueue(status) {
  const api = getCommElectron();
  if (!api?.communication?.clearQueue) {
    const msg = typeof CommercialLicense?.developerPanel?.ELECTRON_ONLY_MSG_AR === 'string'
      ? CommercialLicense.developerPanel.ELECTRON_ONLY_MSG_AR
      : 'هذه الوظيفة متاحة فقط في تطبيق Electron لسطح المكتب.';
    notify('⚠️ ' + msg, 'warning');
    return;
  }
  await api.communication.clearQueue(status || 'sent');
  refreshCommQueueUI();
  notify('🗑️ تم مسح الطابور', 'success');
}

async function sendViaCommunicationGateway(channel, phone, message, meta) {
  ensureCommunicationSettings();
  const payload = { phone, message, channel, ...(meta || {}) };
  const api = getCommElectron();
  if (api?.communication?.send) {
    return api.communication.send(getCommunicationConfigPayload(), payload);
  }
  if (api?.messaging) {
    return channel === 'sms'
      ? api.messaging.sendSMS(phone, message, getCommunicationConfigPayload(), meta)
      : api.messaging.sendWhatsApp(phone, message, getCommunicationConfigPayload(), meta);
  }
  if (typeof MessagingBridge !== 'undefined') {
    return channel === 'sms'
      ? MessagingBridge.sendSMS(phone, message, meta)
      : MessagingBridge.sendWhatsApp(phone, message, meta);
  }
  return { ok: false, reason: 'no_bridge' };
}

// Patch MessagingBridge when loaded after index.html definitions
function patchMessagingBridge() {
  if (typeof MessagingBridge === 'undefined') return;
  const origWa = MessagingBridge.sendWhatsApp.bind(MessagingBridge);
  const origSms = MessagingBridge.sendSMS.bind(MessagingBridge);
  const origStatus = MessagingBridge.getStatus.bind(MessagingBridge);

  MessagingBridge.sendWhatsApp = async function (phone, text, meta) {
    ensureCommunicationSettings();
    const hasApi = (settings.communication.providers || []).some((p) =>
      p.enabled !== false && (p.channels || []).includes('whatsapp') && p.slug !== 'manual' && (p.apiKey || p.baseUrl));
    if (hasApi || getCommElectron()?.communication) {
      return sendViaCommunicationGateway('whatsapp', phone, text, meta);
    }
    return origWa(phone, text, meta);
  };

  MessagingBridge.sendSMS = async function (phone, text, meta) {
    ensureCommunicationSettings();
    const hasApi = (settings.communication.providers || []).some((p) =>
      p.enabled !== false && (p.channels || []).includes('sms') && p.slug !== 'manual' && (p.apiKey || p.baseUrl));
    if (hasApi || getCommElectron()?.communication) {
      return sendViaCommunicationGateway('sms', phone, text, meta);
    }
    return origSms(phone, text, meta);
  };

  MessagingBridge.getStatus = async function () {
    ensureCommunicationSettings();
    const api = getCommElectron();
    if (api?.communication?.getStatus) {
      try { return await api.communication.getStatus(getCommunicationConfigPayload()); } catch { /* */ }
    }
    return origStatus();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    patchMessagingBridge();
    initCommunicationGateway();
  }, 800);
});

// Legacy aliases for settings tab
function loadMessagingApiSettingsUI() { loadCommunicationSettingsUI(); }
function saveMessagingApiSettings() { saveCommunicationSettings(); }
