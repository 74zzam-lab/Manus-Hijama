const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://el.cloud.unifonic.com';

module.exports = {
  id: 'unifonic',
  name: 'Unifonic',
  nameAr: 'يونيفونيك',
  channels: ['sms', 'whatsapp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل App SID / Token' };
    try {
      const res = await requestJson(`${base}/rest/Account/GetBalance`, {
        headers: { Authorization: cfg.apiKey },
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — Unifonic' };
      return { ok: res.status !== 401, message: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const res = await requestJson(`${base}/rest/SMS/messages`, {
      method: 'POST',
      headers: { Authorization: cfg.apiKey, 'Content-Type': 'application/json' },
      body: {
        Recipient: normalizePhone(payload.phone),
        Body: payload.message,
        SenderID: cfg.senderId,
      },
    });
    if (!res.ok) return { ok: false, reason: 'unifonic_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'unifonic', messageId: res.data?.MessageID, channel: payload.channel };
  },
};
