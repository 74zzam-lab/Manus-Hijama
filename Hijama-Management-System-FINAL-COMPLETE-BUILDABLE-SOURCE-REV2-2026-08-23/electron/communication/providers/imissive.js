const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://api.imissive.com';

module.exports = {
  id: 'imissive',
  name: 'iMissive',
  nameAr: 'iMissive',
  channels: ['sms', 'otp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey) return { ok: false, message: 'أدخل API Key' };
    try {
      const res = await requestJson(`${base}/v1/account`, {
        headers: { 'X-API-Key': cfg.apiKey },
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — iMissive' };
      return { ok: res.status === 401 ? false : true, message: res.ok ? 'OK' : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const res = await requestJson(`${base}/v1/sms/send`, {
      method: 'POST',
      headers: { 'X-API-Key': cfg.apiKey, 'Content-Type': 'application/json' },
      body: {
        to: normalizePhone(payload.phone),
        message: payload.message,
        sender: cfg.senderId,
      },
    });
    if (!res.ok) return { ok: false, reason: 'imissive_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: 'imissive', messageId: res.data?.id, channel: payload.channel };
  },
};
