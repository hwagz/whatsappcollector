'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { saveMessage } = require('./db');
const config = require('./config.json');

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

client.on('message', async (msg) => {
  if (msg.fromMe) return;
  if (!msg.from.endsWith('@g.us')) return;

  try {
    const chat = await msg.getChat();
    if (config.ignoredGroups.some(name => name.toLowerCase() === chat.name.toLowerCase())) return;
    const contact = await msg.getContact();
    saveMessage(msg, chat, contact);
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

client.initialize();
