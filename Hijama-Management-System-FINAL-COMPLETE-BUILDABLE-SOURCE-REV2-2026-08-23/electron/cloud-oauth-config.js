/**
 * Cloud OAuth configuration layer — priority:
 * 1. Developer override (encrypted, userData)
 * 2. Bundled cloud-oauth.config.json (build-time)
 * 3. Embedded defaults (cloud-oauth.defaults.json, no secrets)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const REDIRECT_PORT = 42813;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth/callback`;

function defaultsPath() {
  return path.join(__dirname, 'cloud-oauth.defaults.json');
}

function embeddedSecretsPath() {
  return path.join(__dirname, 'cloud-oauth.embedded.json');
}

function bundledConfigPath() {
  return path.join(__dirname, 'cloud-oauth.config.json');
}

function developerOverridePath() {
  try {
    if (app?.getPath) return path.join(app.getPath('userData'), 'cloud-oauth.developer.json');
  } catch { /* not electron */ }
  return null;
}

function deriveEncKey() {
  const seed = [
    app?.getPath?.('userData') || 'tdw',
    process.platform,
    'najjartech-cloud-oauth-v1'
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
}

function decryptSecret(payload) {
  if (!payload?.data) return '';
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function readJsonSafe(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function parseGoogleSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const google = raw.google || raw;
  if (!google?.clientId) return null;
  if (String(google.clientId).includes('YOUR_') || String(google.clientId).includes('REPLACE_ME')) return null;
  return google;
}

function loadEmbeddedDefaults() {
  const raw = readJsonSafe(defaultsPath());
  const google = parseGoogleSection(raw);
  if (!google) return null;
  return {
    clientId: google.clientId,
    clientSecret: google.clientSecret || '',
    projectId: google.projectId || '',
    redirectPort: google.redirectPort || REDIRECT_PORT,
    scopes: google.scopes?.length ? google.scopes : DEFAULT_SCOPES,
    enabled: google.enabled !== false,
    source: 'embedded-defaults'
  };
}

function loadEmbeddedSecrets() {
  let google = parseGoogleSection(readJsonSafe(embeddedSecretsPath()));
  if (!google?.clientId || !google?.clientSecret) {
    try {
      const { decodeProductionBundle } = require('./cloud-oauth-production-bundle');
      google = parseGoogleSection(decodeProductionBundle());
    } catch { /* ignore */ }
  }
  if (!google?.clientId || !google?.clientSecret) return null;
  if (String(google.clientSecret).includes('YOUR_') || String(google.clientSecret).includes('PASTE_YOUR') || String(google.clientSecret).includes('REPLACE_ME') || String(google.clientSecret).includes('BOOTSTRAP_AT_BUILD')) return null;
  return {
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    projectId: google.projectId || '',
    redirectPort: google.redirectPort || REDIRECT_PORT,
    scopes: google.scopes?.length ? google.scopes : DEFAULT_SCOPES,
    enabled: true,
    source: 'embedded-secrets'
  };
}

function loadBundledConfig() {
  const google = parseGoogleSection(readJsonSafe(bundledConfigPath()));
  if (!google?.clientSecret || String(google.clientSecret).includes('YOUR_')) return null;
  if (String(google.clientSecret).includes('PASTE_YOUR') || String(google.clientSecret).includes('REPLACE_ME') || String(google.clientSecret).includes('BOOTSTRAP_AT_BUILD')) return null;
  return {
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    projectId: google.projectId || '',
    redirectPort: google.redirectPort || REDIRECT_PORT,
    scopes: google.scopes?.length ? google.scopes : DEFAULT_SCOPES,
    enabled: true,
    source: 'bundled-config'
  };
}

function loadDeveloperOverride() {
  const file = developerOverridePath();
  const raw = readJsonSafe(file);
  if (!raw?.google) return null;
  const g = raw.google;
  if (g.enabled === false) return { enabled: false, source: 'developer-disabled' };
  const secret = g.clientSecretEnc ? decryptSecret(g.clientSecretEnc) : (g.clientSecret || '');
  if (!g.clientId || !secret) return null;
  return {
    clientId: g.clientId,
    clientSecret: secret,
    projectId: g.projectId || '',
    redirectPort: g.redirectPort || REDIRECT_PORT,
    scopes: g.scopes?.length ? g.scopes : DEFAULT_SCOPES,
    enabled: true,
    source: 'developer-override'
  };
}

function loadEnvSecrets() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  if (String(clientId).includes('YOUR_') || String(clientSecret).includes('YOUR_')) return null;
  if (String(clientSecret).includes('PASTE_YOUR') || /^test/i.test(clientSecret)) return null;
  return {
    clientId,
    clientSecret,
    projectId: process.env.GOOGLE_OAUTH_PROJECT_ID || '',
    redirectPort: parseInt(process.env.GOOGLE_OAUTH_REDIRECT_PORT || String(REDIRECT_PORT), 10) || REDIRECT_PORT,
    scopes: DEFAULT_SCOPES,
    enabled: true,
    source: 'env'
  };
}

function loadMachineStoreSecrets() {
  try {
    const base = process.env.XDG_CONFIG_HOME || require('path').join(require('os').homedir(), '.config');
    const winBase = process.env.APPDATA;
    const candidates = [
      require('path').join(base, 'NajjarTech', 'cloud-oauth.local.json'),
      winBase ? require('path').join(winBase, 'NajjarTech', 'cloud-oauth.local.json') : null,
    ].filter(Boolean);
    for (const file of candidates) {
      const raw = readJsonSafe(file);
      const google = parseGoogleSection(raw);
      if (!google?.clientId || !google?.clientSecret) continue;
      if (String(google.clientSecret).includes('YOUR_') || String(google.clientSecret).includes('PASTE_YOUR')) continue;
      if (/^test/i.test(String(google.clientSecret))) continue;
      return {
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        projectId: google.projectId || '',
        redirectPort: google.redirectPort || REDIRECT_PORT,
        scopes: google.scopes?.length ? google.scopes : DEFAULT_SCOPES,
        enabled: true,
        source: 'machine-store'
      };
    }
  } catch { /* ignore */ }
  return null;
}

/** Resolve active Google OAuth config */
function resolveGoogleConfig() {
  // V2-4: prefer env / OS machine store over git-tracked embedded secrets
  const fromEnv = loadEnvSecrets();
  if (fromEnv) return fromEnv;

  const fromMachine = loadMachineStoreSecrets();
  if (fromMachine) return fromMachine;

  const dev = loadDeveloperOverride();
  if (dev?.enabled === false) {
    const fallback = loadBundledConfig() || loadEmbeddedSecrets() || loadEmbeddedDefaults();
    if (fallback?.clientSecret) return fallback;
    return { clientId: '', clientSecret: '', redirectPort: REDIRECT_PORT, scopes: DEFAULT_SCOPES, enabled: false, source: 'disabled' };
  }
  if (dev?.clientId && dev?.clientSecret) return dev;
  const bundled = loadBundledConfig();
  if (bundled) return bundled;
  const embedded = loadEmbeddedSecrets();
  if (embedded) return embedded;
  const defaults = loadEmbeddedDefaults();
  if (defaults?.clientSecret) return defaults;
  if (defaults?.clientId) return defaults;
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    redirectPort: REDIRECT_PORT,
    scopes: DEFAULT_SCOPES,
    enabled: false,
    source: 'env-fallback'
  };
}

function isConfigured(cfg) {
  const c = cfg || resolveGoogleConfig();
  return !!(c.clientId && c.clientSecret && c.enabled !== false);
}

function getPublicSettings() {
  const cfg = resolveGoogleConfig();
  const devRaw = readJsonSafe(developerOverridePath());
  const hasOverride = !!(devRaw?.google?.clientId);
  return {
    enabled: cfg.enabled !== false && isConfigured(cfg),
    clientId: cfg.clientId || '',
    projectId: cfg.projectId || '',
    scopes: cfg.scopes || DEFAULT_SCOPES,
    redirectUri: REDIRECT_URI,
    redirectPort: cfg.redirectPort || REDIRECT_PORT,
    source: cfg.source || 'unknown',
    hasDeveloperOverride: hasOverride,
    hasSecret: !!cfg.clientSecret,
    secretMasked: cfg.clientSecret ? '••••••••' + String(cfg.clientSecret).slice(-4) : ''
  };
}

function saveDeveloperSettings(input) {
  const file = developerOverridePath();
  if (!file) return { ok: false, message: 'Electron userData unavailable' };
  const prev = readJsonSafe(file) || { google: {} };
  const g = { ...prev.google };
  if (input.enabled != null) g.enabled = !!input.enabled;
  if (input.clientId != null) g.clientId = String(input.clientId).trim();
  if (input.projectId != null) g.projectId = String(input.projectId).trim();
  if (input.scopes != null) g.scopes = Array.isArray(input.scopes) ? input.scopes : DEFAULT_SCOPES;
  g.redirectPort = REDIRECT_PORT;
  if (input.clientSecret != null && String(input.clientSecret).trim() && !String(input.clientSecret).startsWith('••')) {
    g.clientSecretEnc = encryptSecret(String(input.clientSecret).trim());
    delete g.clientSecret;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ google: g, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  return { ok: true, settings: getPublicSettings() };
}

function restoreDeveloperDefaults() {
  const file = developerOverridePath();
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true, settings: getPublicSettings() };
}

async function testConnection() {
  const cfg = resolveGoogleConfig();
  if (!isConfigured(cfg)) {
    return { ok: false, message: 'Client ID أو Client Secret غير مكتمل' };
  }
  try {
    const { OAuth2Client } = require('google-auth-library');
    const oauth2 = new OAuth2Client(cfg.clientId, cfg.clientSecret, REDIRECT_URI);
    const url = oauth2.generateAuthUrl({ access_type: 'offline', scope: cfg.scopes, prompt: 'consent' });
    if (!url || !url.includes('accounts.google.com')) {
      return { ok: false, message: 'فشل إنشاء رابط OAuth' };
    }
    return { ok: true, message: '✅ الإعدادات صالحة — OAuth Client جاهز', source: cfg.source };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

module.exports = {
  resolveGoogleConfig,
  isConfigured,
  getPublicSettings,
  saveDeveloperSettings,
  restoreDeveloperDefaults,
  testConnection,
  REDIRECT_URI,
  DEFAULT_SCOPES
};
