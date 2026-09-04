const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://graph.facebook.com/v21.0';

function tokenOf(cfg) {
  const raw = String(cfg.apiKey || '').trim();
  return raw.replace(/^Bearer\s+/i, '');
}

function buildSendRequest(cfg, payload) {
  const phoneNumberId = String(cfg.senderId || '').trim();
  const base = String(cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  const phone = normalizePhone(payload.phone);
  const url = `${base}/${encodeURIComponent(phoneNumberId)}/messages`;
  const headers = {
    Authorization: `Bearer ${tokenOf(cfg)}`,
    'Content-Type': 'application/json',
  };
  let body;
  if (payload.template) {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: String(payload.template),
        language: { code: payload.language || 'ar' },
      },
    };
    if (Array.isArray(payload.components) && payload.components.length) {
      body.template.components = payload.components;
    }
  } else {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: String(payload.message || ''), preview_url: false },
    };
  }
  return { url, headers, body, phoneNumberId, phone };
}

module.exports = {
  id: 'whatsapp-cloud',
  name: 'WhatsApp Cloud API',
  nameAr: 'واتساب Cloud API (رسمي)',
  channels: ['whatsapp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  buildSendRequest,
  async testConnection(cfg) {
    if (!tokenOf(cfg)) return { ok: false, message: 'أدخل رمز الوصول (Permanent Token)' };
    if (!cfg.senderId) return { ok: false, message: 'أدخل Phone Number ID من Meta' };
    const base = String(cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    try {
      const res = await requestJson(`${base}/${encodeURIComponent(String(cfg.senderId).trim())}`, {
        headers: { Authorization: `Bearer ${tokenOf(cfg)}` },
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — واتساب Cloud API' };
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'الرمز أو رقم الهاتف غير صحيح' };
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message || 'فشل الاتصال' };
    }
  },
  async send(cfg, payload) {
    const req = buildSendRequest(cfg, payload);
    if (!req.phoneNumberId) return { ok: false, reason: 'missing_phone_number_id' };
    if (!tokenOf(cfg)) return { ok: false, reason: 'missing_token' };
    if (!req.phone) return { ok: false, reason: 'invalid_phone' };
    const res = await requestJson(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: 'whatsapp_cloud_error',
        status: res.status,
        detail: res.text ? String(res.text).slice(0, 240) : '',
      };
    }
    const messageId = res.data?.messages && res.data.messages[0] && res.data.messages[0].id;
    return { ok: true, mode: 'api', provider: 'whatsapp-cloud', messageId: messageId || null, channel: 'whatsapp' };
  },
};
