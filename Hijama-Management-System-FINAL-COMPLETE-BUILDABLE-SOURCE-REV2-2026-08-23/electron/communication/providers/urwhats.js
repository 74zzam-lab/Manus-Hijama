const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://api.urwhats.com';

module.exports = {
  id: 'urwhats',
  name: 'urWhats',
  nameAr: 'urWhats',
  channels: ['whatsapp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل API Key' };
    try {
      const res = await requestJson(`${base}/v1/status`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — urWhats' };
      return { ok: res.status < 500, message: res.ok ? 'OK' : `HTTP ${res.status}` };
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
        to: normalizePhone(payload.phone),
        message: payload.message,
        from: cfg.senderId,
        template: payload.template,
        variables: payload.variables,
      },
    });
    if (!res.ok) return { ok: false, reason: 'urwhats_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'urwhats', messageId: res.data?.id, channel: 'whatsapp' };
  },
};
