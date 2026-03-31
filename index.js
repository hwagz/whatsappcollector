'use strict';

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { initDb, saveMessage } = require('./db');
const config = require('./config.json');

function extFromMimetype(mimetype) {
  // mimetype may look like "image/jpeg" or "audio/ogg; codecs=opus"
  const base = mimetype.split(';')[0].trim().split('/')[1] || 'bin';
  const map = { jpeg: 'jpg', 'svg+xml': 'svg', quicktime: 'mov' };
  return map[base] || base;
}

async function downloadAndSaveMedia(msg) {
  const media = await msg.downloadMedia();
  if (!media) return null;

  const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(config.mediaPath, sanitize(msg.from));
  fs.mkdirSync(dir, { recursive: true });

  const ext = extFromMimetype(media.mimetype);
  const filename = `${sanitize(msg.id._serialized)}.${ext}`;
  const filePath = path.join(dir, filename);

  fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
  return filePath;
}

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code above with your WhatsApp app.');
});

client.on('ready', () => {
  console.log('WhatsApp client ready. Listening for group messages...');
});

function isGroupAllowed(chatName) {
  if (config.useAllowedGroups) {
    return config.allowedGroups.some(n => n.toLowerCase() === chatName.toLowerCase());
  }
  return !config.ignoredGroups.some(n => n.toLowerCase() === chatName.toLowerCase());
}

client.on('message', async (msg) => {
  if (msg.fromMe) return;
  if (!msg.from.endsWith('@g.us')) return;

  try {
    const chat = await msg.getChat();
    if (!isGroupAllowed(chat.name)) return;
    const contact = await msg.getContact();
    let mediaPath = null;
    if (config.downloadMedia && msg.hasMedia) {
      try {
        mediaPath = await downloadAndSaveMedia(msg);
      } catch (err) {
        console.error('Failed to download media:', err);
      }
    }
    saveMessage(msg, chat, contact, mediaPath);
    console.log(`[${new Date(msg.timestamp * 1000).toISOString()}] ${chat.name} — ${contact.pushname || msg.author || 'unknown'}: ${msg.body || `<${msg.type}>`}`);
  } catch (err) {
    console.error('Failed to save message:', err);
  }
});

client.on('auth_failure', (msg) => {
  console.error('Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('Client disconnected:', reason);
});

initDb()
  .then(() => client.initialize())
  .catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
