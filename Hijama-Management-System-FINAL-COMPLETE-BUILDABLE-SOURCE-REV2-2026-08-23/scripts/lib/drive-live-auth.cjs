'use strict';

/**
 * Load Google OAuth credentials for live Drive UAT — never logs secrets.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { OAuth2Client } = require('google-auth-library');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2];
  }
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadOAuthConfig() {
  loadDotEnv('/tmp/v24-real-cloud.env');
  loadDotEnv(path.join(os.homedir(), '.config/NajjarTech/v24-real-cloud.env'));

  const vault = readJsonSafe('/tmp/v24-oauth-vault.json');
  const machine = readJsonSafe(path.join(os.homedir(), '.config/NajjarTech/cloud-oauth.local.json'));
  const project = readJsonSafe(path.join(__dirname, '..', '..', 'electron', 'cloud-oauth.config.json'));

  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    vault?.client_id ||
    machine?.google?.clientId ||
    project?.google?.clientId ||
    '';
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    vault?.client_secret ||
    machine?.google?.clientSecret ||
    project?.google?.clientSecret ||
    '';
  const refreshToken =
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN ||
    vault?.refresh_token ||
    machine?.google?.refreshToken ||
    machine?.google?.refresh_token ||
    '';

  return {
    clientId,
    clientSecret,
    refreshToken,
    redirectPort: Number(project?.google?.redirectPort || 42813),
    hasClientCreds: !!(clientId && clientSecret),
    hasRefreshToken: !!refreshToken,
  };
}

async function refreshAccessToken(cfg) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: 'refresh_token',
  }).toString();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    return { ok: false, status: res.status, error: json.error || 'token_refresh_failed' };
  }
  return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in };
}

function createOAuth2FromAccessToken(cfg, accessToken) {
  const redirectUri = `http://127.0.0.1:${cfg.redirectPort || 42813}/oauth/callback`;
  const oauth2 = new OAuth2Client(cfg.clientId, cfg.clientSecret, redirectUri);
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: cfg.refreshToken || undefined,
  });
  return oauth2;
}

function maskToken(value) {
  const t = String(value || '');
  if (!t) return null;
  if (t.length <= 8) return '***';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

module.exports = {
  loadOAuthConfig,
  refreshAccessToken,
  createOAuth2FromAccessToken,
  maskToken,
};
