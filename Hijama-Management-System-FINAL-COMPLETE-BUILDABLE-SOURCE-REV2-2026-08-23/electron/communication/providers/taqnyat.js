const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://api.taqnyat.sa';

module.exports = {
  id: 'taqnyat',
  name: 'Taqnyat',
  nameAr: 'تقنيات',
  channels: ['sms', 'whatsapp', 'otp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل Bearer Token' };
    try {
      const res = await requestJson(`${base}/v1/account/balance`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — Taqnyat' };
      if (res.status === 401) return { ok: false, message: 'مفتاح API غير صحيح' };
      return { ok: true, message: `السيرفر يستجيب (${res.status})` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const phone = normalizePhone(payload.phone);
    const isWa = payload.channel === 'whatsapp';
    const path = isWa ? '/v1/messages/whatsapp' : '/v1/messages';
    const body = isWa
      ? { to: phone, type: 'text', text: { body: payload.message }, from: cfg.senderId }
      : { recipients: [phone], body: payload.message, sender: cfg.senderId };
    const res = await requestJson(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) return { ok: false, reason: 'taqnyat_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'taqnyat', messageId: res.data?.id || res.data?.messageId, channel: payload.channel };
  },
};
