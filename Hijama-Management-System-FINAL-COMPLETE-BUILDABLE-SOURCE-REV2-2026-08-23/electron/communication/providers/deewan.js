const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://apis.deewan.sa';

module.exports = {
  id: 'deewan',
  name: 'Deewan',
  nameAr: 'ديوان',
  channels: ['sms'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل API Key' };
    try {
      const res = await requestJson(`${base}/sms/v1/balance`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — Deewan' };
      return { ok: res.status !== 401, message: res.status === 401 ? 'مفتاح غير صحيح' : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const res = await requestJson(`${base}/sms/v1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        recipients: [normalizePhone(payload.phone)],
        body: payload.message,
        senderName: cfg.senderId,
      },
    });
    if (!res.ok) return { ok: false, reason: 'deewan_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'deewan', messageId: res.data?.id, channel: 'sms' };
  },
};
