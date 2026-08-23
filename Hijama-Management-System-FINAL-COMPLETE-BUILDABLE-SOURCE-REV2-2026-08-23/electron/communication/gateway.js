const { shell } = require('electron');
const { getProviderAdapter, listBuiltinProviders } = require('./providers/registry');
const { normalizePhone } = require('./http-util');
const queue = require('./queue');
const webhook = require('./webhook-server');

let mainWindowRef = null;
let runtimeConfig = null;

function setMainWindow(win) {
  mainWindowRef = win;
}

function notifyRenderer(channel, payload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload);
  }
}

function providerConfigFromStored(stored) {
  return {
    baseUrl: stored.baseUrl || '',
    apiKey: stored.apiKey || '',
    secret: stored.secret || '',
    senderId: stored.senderId || '',
    sendPath: stored.sendPath || stored.customSendPath || '/send',
    authHeader: stored.authHeader || 'Authorization',
    webhookUrl: stored.webhookUrl || '',
  };
}

function findProviderForChannel(config, channel) {
  const comm = config?.communication || {};
  const activeId = comm.activeProviders?.[channel];
  const providers = comm.providers || [];
  if (activeId) {
    const p = providers.find((x) => x.id === activeId && x.enabled !== false);
    if (p) return p;
  }
  return providers.find(
    (p) => p.enabled !== false && (p.channels || []).includes(channel)
  );
}

async function sendViaProvider(storedProvider, payload) {
  const adapter = getProviderAdapter(storedProvider.slug || 'custom');
  const cfg = providerConfigFromStored(storedProvider);
  return adapter.send(cfg, payload);
}

async function testProvider(storedProvider) {
  const adapter = getProviderAdapter(storedProvider.slug || 'custom');
  const cfg = providerConfigFromStored(storedProvider);
  return adapter.testConnection(cfg);
}

async function sendMessage(config, payload) {
  runtimeConfig = config;
  const channel = payload.channel || 'whatsapp';
  const phone = normalizePhone(payload.phone);
  const message = payload.message || '';
  if (!phone) return { ok: false, reason: 'invalid_phone' };
  if (!message) return { ok: false, reason: 'empty_message' };

  const provider = findProviderForChannel(config, channel);
  if (provider && provider.slug !== 'manual' && (provider.baseUrl || provider.apiKey)) {
    try {
      const result = await sendViaProvider(provider, { ...payload, phone, channel });
      if (result?.ok !== false) return result;
      if (payload.allowQueue !== false && config?.communication?.queue?.enabled !== false) {
        queue.enqueue({ phone, message, channel, providerId: provider.id, slug: provider.slug });
        return { ok: true, mode: 'queued', reason: result.reason };
      }
      return result;
    } catch (e) {
      if (payload.allowQueue !== false) {
        queue.enqueue({ phone, message, channel, providerId: provider.id, slug: provider.slug });
        return { ok: true, mode: 'queued', error: e.message };
      }
      return { ok: false, reason: e.message };
    }
  }

  if (channel === 'sms') {
    await shell.openExternal(`sms:${phone}?body=${encodeURIComponent(message)}`);
    return { ok: true, channel: 'sms', mode: 'deeplink', phone };
  }
  await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  return { ok: true, channel: 'whatsapp', mode: 'deeplink', phone };
}

async function processQueueNow(config) {
  runtimeConfig = config;
  return queue.processQueue(async (item) => {
    const providers = config?.communication?.providers || [];
    const provider = providers.find((p) => p.id === item.providerId) ||
      providers.find((p) => p.slug === item.slug);
    if (!provider) {
      return sendMessage(config, { phone: item.phone, message: item.message, channel: item.channel, allowQueue: false });
    }
    return sendViaProvider(provider, item);
  }, config?.communication?.queue || {});
}

async function initGateway(config, mainWindow) {
  setMainWindow(mainWindow);
  queue.initQueue();
  queue.setStatusCallback((ev) => notifyRenderer('communication:queueUpdate', ev));

  const comm = config?.communication || {};
  webhook.onWebhookEvent((event) => {
    notifyRenderer('communication:webhook', event);
  });
  await webhook.startWebhookServer({
    port: comm.webhookPort || 17890,
    secret: comm.webhookSecret || '',
  });
}

function getGatewayStatus(config) {
  const comm = config?.communication || {};
  const waProvider = findProviderForChannel(config, 'whatsapp');
  const smsProvider = findProviderForChannel(config, 'sms');
  const q = queue.getQueueStatus();
  return {
    whatsapp: {
      available: true,
      mode: waProvider?.slug && waProvider.slug !== 'manual' ? 'api' : 'deeplink',
      provider: waProvider?.name || null,
    },
    sms: {
      available: true,
      mode: smsProvider?.slug && smsProvider.slug !== 'manual' ? 'api' : 'deeplink',
      provider: smsProvider?.name || null,
    },
    queue: q,
    webhookUrl: webhook.getWebhookUrl(),
    providers: (comm.providers || []).filter((p) => p.enabled !== false).length,
  };
}

module.exports = {
  listBuiltinProviders,
  testProvider,
  sendMessage,
  processQueueNow,
  initGateway,
  getGatewayStatus,
  getQueueItems: queue.getQueueItems,
  clearQueue: queue.clearQueue,
  enqueue: queue.enqueue,
};
