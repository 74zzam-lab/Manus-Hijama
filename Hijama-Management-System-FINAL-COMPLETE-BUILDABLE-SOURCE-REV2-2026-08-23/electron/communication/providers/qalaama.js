const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://api.qalaama.com';

module.exports = {
  id: 'qalaama',
  name: 'Qalaama',
  nameAr: 'قلامة',
  channels: ['sms', 'whatsapp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل API Key' };
    try {
      const res = await requestJson(`${base}/v1/account`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        timeout: 12000,
      });
      return { ok: res.ok || res.status === 404, message: res.ok ? 'تم الاتصال' : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const path = payload.channel === 'whatsapp' ? '/v1/whatsapp/send' : '/v1/sms/send';
    const res = await requestJson(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: { to: normalizePhone(payload.phone), message: payload.message, sender: cfg.senderId },
    });
    if (!res.ok) return { ok: false, reason: 'qalaama_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'qalaama', messageId: res.data?.id, channel: payload.channel };
  },
};
