const http = require('http');
const https = require('https');
const { URL } = require('url');

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error('invalid_url'));
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const bodyStr = options.body != null ? JSON.stringify(options.body) : null;
    const headers = {
      Accept: 'application/json',
      ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      ...(options.headers || {}),
    };
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || (bodyStr ? 'POST' : 'GET'),
        headers,
        timeout: options.timeout || 25000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch { /* text */ }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: json,
            text: data,
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('0')) return '966' + digits.slice(1);
  if (digits.length === 9) return '966' + digits;
  return digits;
}

module.exports = { requestJson, normalizePhone };
