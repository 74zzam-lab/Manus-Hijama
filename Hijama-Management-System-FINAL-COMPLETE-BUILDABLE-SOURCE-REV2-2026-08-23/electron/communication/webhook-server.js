const http = require('http');
const { URL } = require('url');

let server = null;
let port = 17890;
let secret = '';
let eventHandler = null;

function startWebhookServer(options = {}) {
  port = parseInt(options.port, 10) || 17890;
  secret = options.secret || '';
  if (server) return { ok: true, port, url: getWebhookUrl() };

  server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch { payload = { raw: body }; }
      if (secret) {
        const token = req.headers['x-webhook-secret'] || req.headers['authorization'];
        if (token !== secret && token !== `Bearer ${secret}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
          return;
        }
      }
      const event = {
        at: new Date().toISOString(),
        path: req.url,
        payload,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent'],
        },
      };
      if (eventHandler) eventHandler(event);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received: true }));
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ ok: true, port, url: getWebhookUrl() });
    });
    server.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

function stopWebhookServer() {
  if (server) {
    server.close();
    server = null;
  }
}

function getWebhookUrl() {
  return `http://127.0.0.1:${port}/webhook`;
}

function onWebhookEvent(handler) {
  eventHandler = handler;
}

module.exports = { startWebhookServer, stopWebhookServer, getWebhookUrl, onWebhookEvent };
