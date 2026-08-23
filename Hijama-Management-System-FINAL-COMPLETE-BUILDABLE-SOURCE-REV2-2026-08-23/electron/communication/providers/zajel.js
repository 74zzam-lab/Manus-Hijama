const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://api.zajel.ai';

module.exports = {
  id: 'zajel',
  name: 'Zajel AI',
  nameAr: 'زاجل',
  channels: ['sms', 'whatsapp', 'email'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل API Key' };
    try {
      const res = await requestJson(`${base}/v1/health`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        timeout: 12000,
      });
      return { ok: res.ok || res.status === 404, message: res.ok ? 'تم الاتصال — Zajel' : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const res = await requestJson(`${base}/v1/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        channel: payload.channel,
        to: normalizePhone(payload.phone),
        body: payload.message,
        from: cfg.senderId,
      },
    });
    if (!res.ok) return { ok: false, reason: 'zajel_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'zajel', messageId: res.data?.id, channel: payload.channel };
  },
};
