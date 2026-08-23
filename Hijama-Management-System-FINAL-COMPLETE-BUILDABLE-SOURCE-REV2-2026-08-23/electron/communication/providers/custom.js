const { requestJson, normalizePhone } = require('../http-util');

module.exports = {
  id: 'custom',
  name: 'Custom REST API',
  nameAr: 'API مخصص',
  channels: ['whatsapp', 'sms', 'otp', 'email'],
  defaultBaseUrl: '',
  fields: ['baseUrl', 'apiKey', 'secret', 'senderId', 'sendPath', 'authHeader'],
  async testConnection(cfg) {
    if (!cfg.baseUrl) return { ok: false, message: 'أدخل رابط API' };
    const path = cfg.sendPath || '/';
    const url = cfg.baseUrl.replace(/\/$/, '') + path;
    const headers = buildHeaders(cfg);
    try {
      const res = await requestJson(url, { method: 'GET', headers, timeout: 12000 });
      if (res.ok || res.status === 401 || res.status === 405 || res.status === 404) {
        return { ok: true, message: `السيرفر يستجيب (${res.status})` };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message || 'فشل الاتصال' };
    }
  },
  async send(cfg, payload) {
    const path = cfg.sendPath || '/send';
    const url = cfg.baseUrl.replace(/\/$/, '') + path;
    const phone = normalizePhone(payload.phone);
    const body = {
      to: phone,
      phone,
      recipient: phone,
      message: payload.message,
      text: payload.message,
      sender: cfg.senderId,
      sender_id: cfg.senderId,
      channel: payload.channel,
      template: payload.template,
      variables: payload.variables || {},
    };
    const res = await requestJson(url, {
      method: 'POST',
      headers: buildHeaders(cfg),
      body,
    });
    if (!res.ok) {
      return { ok: false, reason: 'api_error', status: res.status, detail: res.text?.slice(0, 200) };
    }
    const messageId = res.data?.message_id || res.data?.id || res.data?.messageId || null;
    return { ok: true, mode: 'api', provider: 'custom', messageId, channel: payload.channel };
  },
};

function buildHeaders(cfg) {
  const headers = {};
  const authHeader = cfg.authHeader || 'Authorization';
  if (cfg.apiKey) {
    if (authHeader.toLowerCase() === 'authorization') {
      headers.Authorization = cfg.apiKey.startsWith('Bearer ') ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
    } else {
      headers[authHeader] = cfg.apiKey;
    }
  }
  if (cfg.secret) headers['X-API-Secret'] = cfg.secret;
  return headers;
}
