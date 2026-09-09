const { requestJson, normalizePhone } = require('../http-util');

const DEFAULT_BASE = 'https://api.4jawaly.com';

module.exports = {
  id: '4jawaly',
  name: '4jawaly',
  nameAr: 'فورجوالي',
  channels: ['sms', 'whatsapp', 'otp'],
  defaultBaseUrl: DEFAULT_BASE,
  fields: ['baseUrl', 'apiKey', 'secret', 'senderId'],
  async testConnection(cfg) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    if (!cfg.apiKey || !cfg.secret) return { ok: false, message: 'أدخل App Key و App Secret' };
    try {
      const res = await requestJson(`${base}/api/v1/account/balance`, {
        headers: jawalyHeaders(cfg),
        timeout: 12000,
      });
      if (res.ok) return { ok: true, message: 'تم الاتصال — 4jawaly' };
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'بيانات الاعتماد غير صحيحة' };
      return { ok: true, message: `السيرفر يستجيب (${res.status})` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
  async send(cfg, payload) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const phone = normalizePhone(payload.phone);
    const isWa = payload.channel === 'whatsapp';
    const path = isWa ? '/api/v1/whatsapp/send' : '/api/v1/account/area/sms/send';
    const body = isWa
      ? { number: phone, message: payload.message, sender: cfg.senderId }
      : { numbers: phone, sender: cfg.senderId, message: payload.message, app_key: cfg.apiKey, app_secret: cfg.secret };
    const res = await requestJson(base + path, {
      method: 'POST',
      headers: jawalyHeaders(cfg),
      body,
    });
    if (!res.ok) return { ok: false, reason: '4jawaly_error', status: res.status, detail: res.text?.slice(0, 200) };
    return { ok: true, mode: 'api', provider: '4jawaly', messageId: res.data?.id || res.data?.job_id, channel: payload.channel };
  },
};

function jawalyHeaders(cfg) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.apiKey && cfg.secret) {
    h.Authorization = `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.secret}`).toString('base64')}`;
  } else if (cfg.apiKey) {
    h.Authorization = `Bearer ${cfg.apiKey}`;
  }
  return h;
}
