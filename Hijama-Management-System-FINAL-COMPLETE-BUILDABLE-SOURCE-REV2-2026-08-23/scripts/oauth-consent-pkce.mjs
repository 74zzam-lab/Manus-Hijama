#!/usr/bin/env node
'use strict';

/**
 * One-shot Google OAuth PKCE consent for live Drive UAT.
 * Saves refresh token to /tmp/v24-oauth-vault.json (mode 0600) — never prints secrets.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VAULT = '/tmp/v24-oauth-vault.json';
const PORT = Number(process.env.GOOGLE_OAUTH_REDIRECT_PORT || 42813);

function loadProjectConfig() {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'electron', 'cloud-oauth.config.json'), 'utf8'));
  return cfg.google;
}

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function waitForCode(port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('oauth_timeout'));
    }, 10 * 60 * 1000);
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (error) {
          res.end(`<html><body><h2>OAuth failed: ${error}</h2></body></html>`);
          clearTimeout(timer);
          server.close();
          reject(new Error(error));
          return;
        }
        if (code) {
          res.end('<html><body><h2>OAuth success — you can close this tab.</h2></body></html>');
          clearTimeout(timer);
          server.close();
          resolve(code);
          return;
        }
        res.end('<html><body>Waiting for OAuth…</body></html>');
      } catch (err) {
        clearTimeout(timer);
        server.close();
        reject(err);
      }
    });
    server.listen(port, '127.0.0.1');
  });
}

async function exchangeCode(google, code, verifier, redirectUri) {
  const body = new URLSearchParams({
    client_id: google.clientId,
    client_secret: google.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }).toString();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || `token_exchange_failed_${res.status}`);
  }
  return json;
}

async function main() {
  const google = loadProjectConfig();
  if (!google?.clientId || !google?.clientSecret) {
    console.error(JSON.stringify({ ok: false, error: 'oauth_config_missing', secretsPrinted: false }));
    process.exit(1);
  }

  const { verifier, challenge } = pkcePair();
  const redirectUri = `http://127.0.0.1:${PORT}/oauth/callback`;
  const scope = encodeURIComponent(google.scopes?.[0] || 'https://www.googleapis.com/auth/drive.file');
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(google.clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=${scope}&access_type=offline&prompt=consent` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;

  console.log(JSON.stringify({
    ok: true,
    action: 'open_browser_for_consent',
    authUrl,
    redirectUri,
    port: PORT,
    secretsPrinted: false,
  }));

  try {
    execSync(`xdg-open ${JSON.stringify(authUrl)}`, { stdio: 'ignore' });
  } catch {
    /* browser open best-effort */
  }

  const code = await waitForCode(PORT);
  const tokens = await exchangeCode(google, code, verifier, redirectUri);
  if (!tokens.refresh_token) {
    console.error(JSON.stringify({
      ok: false,
      error: 'refresh_token_missing',
      hint: 'Revoke app access in Google Account and retry with prompt=consent',
      secretsPrinted: false,
    }));
    process.exit(1);
  }

  mkdirSync(dirname(VAULT), { recursive: true });
  writeFileSync(
    VAULT,
    JSON.stringify(
      {
        client_id: google.clientId,
        client_secret: google.clientSecret,
        refresh_token: tokens.refresh_token,
        obtained_at: new Date().toISOString(),
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  );
  chmodSync(VAULT, 0o600);

  console.log(JSON.stringify({
    ok: true,
    vaultPath: VAULT,
    hasRefreshToken: true,
    expiresIn: tokens.expires_in || null,
    secretsPrinted: false,
  }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err), secretsPrinted: false }));
  process.exit(1);
});
