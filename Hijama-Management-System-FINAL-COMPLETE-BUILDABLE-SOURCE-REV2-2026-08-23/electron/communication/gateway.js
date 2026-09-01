const fs = require('fs');
const path = require('path');
const { app, clipboard, nativeImage, shell } = require('electron');
const { getProviderAdapter, listBuiltinProviders } = require('./providers/registry');
const { normalizePhone } = require('./http-util');
const queue = require('./queue');
const webhook = require('./webhook-server');

const MEDIA_QUEUE_MAX = 200000;

function normalizeMedia(media) {
  if (!media || typeof media !== 'object') return null;
  const mime = String(media.mime || media.type || '').trim();
  const name = String(media.name || 'media')
    .replace(/[^\w.\-()\u0600-\u06FF ]+/g, '_')
    .slice(0, 80);
  const kind = media.kind === 'video' || mime.startsWith('video/')
    ? 'video'
    : 'image';
  const dataUrl = String(media.dataUrl || media.data || '');
  if (!dataUrl && !media.path) return null;
  if (dataUrl && !/^data:/i.test(dataUrl)) return null;
  return {
    mime: mime || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    name: name || (kind === 'video' ? 'clip.mp4' : 'image.jpg'),
    kind,
    dataUrl,
    path: media.path || '',
  };
}

function mediaBuffer(media) {
  if (!media?.dataUrl) return null;
  const comma = media.dataUrl.indexOf(',');
  const b64 = comma >= 0 ? media.dataUrl.slice(comma + 1) : media.dataUrl;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

function queueableMedia(media) {
  if (!media) return undefined;
  if ((media.dataUrl || '').length > MEDIA_QUEUE_MAX) {
    return { name: media.name, mime: media.mime, kind: media.kind, omitted: true };
  }
  return media;
}

function collectMediaItems(payload) {
  const items = [];
  const seen = new Set();
  function push(raw) {
    const n = normalizeMedia(raw);
    if (!n) return;
    const key = String(n.dataUrl || n.path || n.name || '').slice(0, 160);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    items.push(n);
  }
  if (payload && Array.isArray(payload.mediaList) && payload.mediaList.length) {
    payload.mediaList.forEach(push);
  } else if (payload) {
    push(payload.media);
  }
  return items;
}

async function stageMediaForDeeplink(media) {
  const out = { copied: false, stagedPath: '', hint: '' };
  if (!media) return out;
  try {
    const dir = path.join(app.getPath('temp'), 'tdw-msg-media');
    fs.mkdirSync(dir, { recursive: true });
    const buf = mediaBuffer(media);
    if (buf && buf.length) {
      const dest = path.join(dir, media.name || (media.kind === 'video' ? 'clip.mp4' : 'image.jpg'));
      fs.writeFileSync(dest, buf);
      out.stagedPath = dest;
      try { shell.showItemInFolder(dest); } catch { /* folder hint is optional */ }
    }
    if (media.kind === 'image' && media.dataUrl) {
      const img = nativeImage.createFromDataURL(media.dataUrl);
      if (img && !img.isEmpty()) {
        clipboard.writeImage(img);
        out.copied = true;
      }
    }
    out.hint = out.copied
      ? 'تم نسخ الصورة — الصقها في واتساب (Ctrl+V)'
      : (out.stagedPath ? 'فُتح مجلد المرفق لإرفاقه يدوياً في واتساب' : '');
  } catch (e) {
    out.hint = e.message || '';
  }
  return out;
}

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

async function sendOneMessage(config, payload, media) {
  const channel = payload.channel || 'whatsapp';
  const phone = payload.phone;
  const message = payload.message || '';
  if (!message && !media) return { ok: false, reason: 'empty_message' };

  const sendPayload = { ...payload, phone, message, channel, media: media || undefined };
  delete sendPayload.mediaList;
  delete sendPayload._mediaPart;

  const provider = findProviderForChannel(config, channel);
  if (provider && provider.slug !== 'manual' && (provider.baseUrl || provider.apiKey)) {
    try {
      const result = await sendViaProvider(provider, sendPayload);
      if (result?.ok !== false) return result;
      if (payload.allowQueue !== false && config?.communication?.queue?.enabled !== false) {
        queue.enqueue({
          phone, message, channel,
          providerId: provider.id, slug: provider.slug,
          media: queueableMedia(media),
        });
        return { ok: true, mode: 'queued', reason: result.reason };
      }
      return result;
    } catch (e) {
      if (payload.allowQueue !== false) {
        queue.enqueue({
          phone, message, channel,
          providerId: provider.id, slug: provider.slug,
          media: queueableMedia(media),
        });
        return { ok: true, mode: 'queued', error: e.message };
      }
      return { ok: false, reason: e.message };
    }
  }

  if (channel === 'sms') {
    await shell.openExternal(`sms:${phone}?body=${encodeURIComponent(message)}`);
    return { ok: true, channel: 'sms', mode: 'deeplink', phone, mediaAttached: false };
  }
  const staged = await stageMediaForDeeplink(media);
  await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  return {
    ok: true,
    channel: 'whatsapp',
    mode: 'deeplink',
    phone,
    mediaCopied: !!staged.copied,
    mediaPath: staged.stagedPath || '',
    mediaHint: staged.hint || '',
  };
}

async function sendMessage(config, payload) {
  runtimeConfig = config;
  const channel = payload.channel || 'whatsapp';
  const phone = normalizePhone(payload.phone);
  const message = payload.message || '';
  if (!phone) return { ok: false, reason: 'invalid_phone' };

  const mediaItems = collectMediaItems(payload);
  const media = mediaItems[0] || null;
  if (!message && !media) return { ok: false, reason: 'empty_message' };

  const provider = findProviderForChannel(config, channel);
  const isApi = !!(provider && provider.slug !== 'manual' && (provider.baseUrl || provider.apiKey));
  const base = { ...payload, phone, message, channel };

  if (mediaItems.length > 1 && payload._mediaPart == null && isApi) {
    const results = [];
    let last = { ok: true, mode: 'api' };
    for (let i = 0; i < mediaItems.length; i++) {
      const isLast = i === mediaItems.length - 1;
      last = await sendOneMessage(config, {
        ...base,
        media: mediaItems[i],
        message: isLast ? message : '',
        _mediaPart: i,
      }, mediaItems[i]);
      results.push(last);
      if (i < mediaItems.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    return {
      ...last,
      ok: results.every((r) => r && r.ok !== false),
      mediaParts: mediaItems.length,
      parts: results,
    };
  }

  if (mediaItems.length > 1 && !isApi) {
    const hints = [];
    let copied = false;
    let stagedPath = '';
    for (const item of mediaItems) {
      const staged = await stageMediaForDeeplink(item);
      if (staged.copied) copied = true;
      if (staged.stagedPath) stagedPath = staged.stagedPath;
      if (staged.hint) hints.push(staged.hint);
    }
    if (channel === 'sms') {
      await shell.openExternal(`sms:${phone}?body=${encodeURIComponent(message)}`);
      return { ok: true, channel: 'sms', mode: 'deeplink', phone, mediaAttached: false };
    }
    await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    return {
      ok: true,
      channel: 'whatsapp',
      mode: 'deeplink',
      phone,
      mediaCopied: copied,
      mediaPath: stagedPath,
      mediaParts: mediaItems.length,
      mediaHint: hints.filter(Boolean).join(' — ')
        || 'مرفقان: الصورة المشتركة ثم مرفق النوع — الصق/أرفق من المجلد المفتوح',
    };
  }

  return sendOneMessage(config, base, media);
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
  normalizeMedia,
  collectMediaItems,
};
