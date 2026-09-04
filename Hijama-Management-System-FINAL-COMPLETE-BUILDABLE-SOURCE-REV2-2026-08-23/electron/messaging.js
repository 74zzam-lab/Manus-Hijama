const gateway = require('./communication/gateway');

async function sendWhatsApp(phone, text, config, meta) {
  return gateway.sendMessage(config || {}, {
    phone,
    message: text,
    channel: 'whatsapp',
    ...(meta || {}),
  });
}

async function sendSMS(phone, text, config, meta) {
  return gateway.sendMessage(config || {}, {
    phone,
    message: text,
    channel: 'sms',
    ...(meta || {}),
  });
}

async function getMessagingStatus(config) {
  return gateway.getGatewayStatus(config || {});
}

module.exports = {
  sendWhatsApp,
  sendSMS,
  getMessagingStatus,
  gateway,
};
