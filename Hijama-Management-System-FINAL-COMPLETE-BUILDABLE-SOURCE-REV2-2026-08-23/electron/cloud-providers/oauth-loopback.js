/**
 * OAuth 2.0 loopback redirect server for desktop apps.
 */
'use strict';

const http = require('http');
const { URL } = require('url');

function attachOAuthHandler(server, getPort, callbackPath, resolve, reject) {
  const timer = setTimeout(() => {
    try { server.close(); } catch { /* ignore */ }
    reject(new Error('oauth_timeout'));
  }, 5 * 60 * 1000);

  server.on('request', (req, res) => {
    try {
      const port = getPort();
      const u = new URL(req.url, `http://127.0.0.1:${port}`);
      const pathname = u.pathname || '/';
      if (pathname !== callbackPath && pathname !== '/') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (error) {
        res.end(`<html dir="rtl"><body style="font-family:sans-serif;padding:40px"><h2>فشل الربط</h2><p>${error}</p><p>يمكنك إغلاق هذه النافذة.</p></body></html>`);
        clearTimeout(timer);
        server.close();
        reject(new Error(error));
        return;
      }
      if (code) {
        res.end('<html dir="rtl"><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>✅ تم الربط بنجاح</h2><p>يمكنك إغلاق هذه النافذة والعودة للبرنامج.</p></body></html>');
        clearTimeout(timer);
        server.close();
        resolve(code);
        return;
      }
      res.end('<html><body>OAuth</body></html>');
    } catch (e) {
      try {
        res.writeHead(500);
        res.end('Error');
      } catch { /* ignore */ }
      clearTimeout(timer);
      try { server.close(); } catch { /* ignore */ }
      reject(e);
    }
  });
}

function startLoopbackServer(port, callbackPath = '/oauth/callback') {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    attachOAuthHandler(server, () => port, callbackPath, resolve, reject);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {});
  });
}

/**
 * Prefer preferredPort; on EADDRINUSE try nearby ports then ephemeral.
 * @returns {Promise<{ port: number, codePromise: Promise<string> }>}
 */
async function startLoopbackServerFlexible(preferredPort = 42813, callbackPath = '/oauth/callback') {
  const base = Number(preferredPort) || 42813;
  const candidates = [base, base + 1, base + 2, base + 3];

  for (const port of candidates) {
    try {
      const codePromise = startLoopbackServer(port, callbackPath);
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve('listening'), 50);
        codePromise.then(
          () => { clearTimeout(t); resolve('code'); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      return { port, codePromise };
    } catch (err) {
      if (!/EADDRINUSE/i.test(String(err && (err.code || err.message)))) {
        throw err;
      }
    }
  }

  return new Promise((resolveOuter, rejectOuter) => {
    const server = http.createServer();
    let settled = false;
    let codeResolve;
    let codeReject;
    const codePromise = new Promise((res, rej) => {
      codeResolve = res;
      codeReject = rej;
    });

    attachOAuthHandler(
      server,
      () => server.address().port,
      callbackPath,
      (code) => codeResolve(code),
      (err) => {
        if (!settled) {
          settled = true;
          rejectOuter(err);
        }
        codeReject(err);
      }
    );

    server.on('error', (err) => {
      if (!settled) {
        settled = true;
        rejectOuter(err);
      }
      codeReject(err);
    });

    server.listen(0, '127.0.0.1', () => {
      settled = true;
      resolveOuter({ port: server.address().port, codePromise });
    });
  });
}

module.exports = { startLoopbackServer, startLoopbackServerFlexible };
