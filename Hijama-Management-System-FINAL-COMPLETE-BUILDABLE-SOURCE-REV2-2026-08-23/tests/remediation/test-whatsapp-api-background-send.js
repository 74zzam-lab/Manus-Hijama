#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');
const os = require('os');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const Slot = require(path.join(root, 'cloud/wa-send-slot.js'));
const cloud = require(path.join(root, 'electron/communication/providers/whatsapp-cloud.js'));
const registry = require(path.join(root, 'electron/communication/providers/registry.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gatewaySrc = fs.readFileSync(path.join(root, 'electron/communication/gateway.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const commUiSrc = fs.readFileSync(path.join(root, 'cupping-communication-gateway.js'), 'utf8');

const textReq = cloud.buildSendRequest(
  { apiKey: 'tok_abc', senderId: '10987654321', baseUrl: 'https://graph.facebook.com/v21.0' },
  { phone: '0501234567', message: 'مرحبا' }
);
check(textReq.url.indexOf('/10987654321/messages') >= 0, 'Cloud API posts to Phone Number ID /messages');
check(textReq.headers.Authorization === 'Bearer tok_abc', 'Cloud API uses bearer token');
check(textReq.body.type === 'text' && textReq.body.text.body === 'مرحبا', 'default body is session text');
check(textReq.body.messaging_product === 'whatsapp', 'Cloud API sets messaging_product');

const tplReq = cloud.buildSendRequest(
  { apiKey: 'Bearer tok_abc', senderId: '10987654321' },
  { phone: '966501234567', template: 'hello_world', language: 'ar' }
);
check(tplReq.body.type === 'template' && tplReq.body.template.name === 'hello_world', 'template payload uses Meta template shape');
check(tplReq.body.template.language.code === 'ar', 'template language defaults to ar when provided');
check(tplReq.headers.Authorization === 'Bearer tok_abc', 'Bearer prefix on the token is not doubled');

check(registry.BUILTIN['whatsapp-cloud'] === cloud, 'whatsapp-cloud is registered');
check(registry.listBuiltinProviders().some((p) => p.id === 'whatsapp-cloud'), 'provider list includes Cloud API');

check(Slot.silentSendNeedsApi(21) && !Slot.silentSendNeedsApi(20), 'batches above 20 require an API for silent send');
check(Slot.apiConfirmMessage(1000).indexOf('الطابور الخلفي') >= 0, 'API confirm copy mentions the background queue');
check(Slot.windowsForBatch(50000, Slot.launchStrategy({ apiReady: true })) === 0, 'API plan still opens zero windows');

function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = src.match(re);
  if (!m) return '';
  let depth = 0;
  for (let j = m.index + m[0].length - 1; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  return '';
}

const dispatchFn = extractFn(indexSrc, 'dispatchMessagingJobs');
const enqueueFn = extractFn(indexSrc, 'enqueueApiMessagingBatch');
check(dispatchFn && /enqueueApiMessagingBatch/.test(dispatchFn), 'API dispatch goes through the background enqueue helper');
check(enqueueFn && /enqueueBatch/.test(enqueueFn) && /drainQueue/.test(enqueueFn), 'helper calls enqueueBatch then drainQueue');
check(enqueueFn && !/sendClientMessage/.test(enqueueFn), 'background enqueue does not send one-by-one in the renderer');
check(dispatchFn && /needs_api/.test(dispatchFn), 'large deeplink batches are refused without an API');
check(!/for \(let i = 0; i < list\.length; i\+\+\)/.test(dispatchFn), 'dispatch no longer awaits each API recipient on the UI thread');
check(/function onCommQueueUpdate/.test(commUiSrc), 'queue events have a renderer handler');
check(/Phone Number ID/.test(commUiSrc), 'Cloud API hint names Phone Number ID');
check(preloadSrc.indexOf('communication:enqueueBatch') >= 0 && preloadSrc.indexOf('communication:drainQueue') >= 0, 'preload exposes batch enqueue and drain');
const sendQueuedFn = extractFn(gatewaySrc, 'sendQueuedItem');
check(/function sendQueuedItem/.test(gatewaySrc) && /no_api_provider/.test(gatewaySrc), 'queued drain fails closed without an API provider');
check(sendQueuedFn && !/sendMessage\(/.test(sendQueuedFn) && !/openExternal/.test(sendQueuedFn) && !/launchWhatsAppUrl/.test(sendQueuedFn), 'sendQueuedItem does not fall back to deeplink sendMessage');
const mainSrc = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
check(/handle\('communication:drainQueue'[\s\S]{0,280}setImmediate/.test(mainSrc), 'drain IPC returns immediately and continues in the main process');

let deeplinkCalls = 0;
const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'electron') {
    return {
      app: { getPath: () => os.tmpdir() },
      clipboard: { writeImage() {} },
      nativeImage: { createFromDataURL() { return { isEmpty: () => true }; } },
      shell: {
        openExternal: async () => { deeplinkCalls += 1; throw new Error('deeplink_should_not_run'); },
        showItemInFolder() {},
      },
    };
  }
  return origRequire.apply(this, arguments);
};

const gateway = require(path.join(root, 'electron/communication/gateway.js'));
Module.prototype.require = origRequire;

(async () => {
  check(gateway.isApiProvider({ slug: 'whatsapp-cloud', apiKey: 't', senderId: '1' }) === true, 'Cloud API with token is an API provider');
  check(gateway.isApiProvider({ slug: 'manual', apiKey: 't' }) === false, 'manual slug is never an API provider');
  check(gateway.isApiProvider({ slug: 'custom' }) === false, 'custom without credentials is not API');

  const denied = gateway.enqueueBatch({
    communication: { activeProviders: { whatsapp: '' }, providers: [] },
  }, [{ phone: '966500000001', message: 'hi' }]);
  check(denied.ok === false && denied.reason === 'no_api_provider' && denied.queued === 0, 'enqueueBatch without API returns no_api_provider');

  const cfg = {
    communication: {
      activeProviders: { whatsapp: 'p1' },
      providers: [{
        id: 'p1',
        slug: 'whatsapp-cloud',
        enabled: true,
        apiKey: 'tok',
        senderId: '10987654321',
        channels: ['whatsapp'],
      }],
    },
  };
  const queued = gateway.enqueueBatch(cfg, [
    { phone: '966500000001', message: 'one', type: 'promo', refId: 'r1', clientName: 'A' },
    { phone: '966500000002', message: 'two', type: 'promo', refId: 'r2', clientName: 'B' },
  ]);
  check(queued.ok === true && queued.queued === 2, 'enqueueBatch stores API jobs');

  const noProviderSend = await gateway.sendQueuedItem({ communication: { providers: [] } }, {
    phone: '966500000001',
    message: 'x',
    providerId: 'missing',
  });
  check(noProviderSend && noProviderSend.ok === false && noProviderSend.reason === 'no_api_provider', 'sendQueuedItem refuses deeplink fallback');
  check(deeplinkCalls === 0, 'queued send never opened an OS/WhatsApp window');

  const status = gateway.getGatewayStatus({
    communication: { providers: [{ id: 'p1', slug: 'custom', enabled: true, channels: ['whatsapp'] }], activeProviders: { whatsapp: 'p1' } },
  });
  check(status.whatsapp.mode === 'deeplink', 'status stays deeplink until the provider has credentials');

  if (errors.length) {
    console.error('FAIL whatsapp-api-background-send');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS remediation:whatsapp-api-background-send');
})().catch((err) => {
  console.error('FAIL whatsapp-api-background-send');
  console.error(err);
  process.exit(1);
});
