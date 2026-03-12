'use strict';

const Database = require('better-sqlite3');

const db = new Database('messages.db');

// Schema must be created before prepare() — better-sqlite3 validates table existence at compile time
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wid         TEXT    NOT NULL UNIQUE,
    group_id    TEXT    NOT NULL,
    group_name  TEXT,
    sender_id   TEXT,
    sender_name TEXT,
    body        TEXT,
    type        TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL,
    has_media   INTEGER NOT NULL DEFAULT 0,
    recap       INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_messages_group_id  ON messages(group_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
`);

// Migration: add recap column if it doesn't exist (for databases created before this column was added)
const columns = db.prepare('PRAGMA table_info(messages)').all();
if (!columns.some(col => col.name === 'recap')) {
  db.exec('ALTER TABLE messages ADD COLUMN recap INTEGER NOT NULL DEFAULT 0');
}

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (wid, group_id, group_name, sender_id, sender_name, body, type, timestamp, has_media)
  VALUES
    (@wid, @group_id, @group_name, @sender_id, @sender_name, @body, @type, @timestamp, @has_media)
`);

function saveMessage(msg, chat, contact) {
  insertMessage.run({
    wid:         msg.id._serialized,
    group_id:    msg.from,
    group_name:  chat.name || null,
    sender_id:   msg.author || null,
    sender_name: contact.pushname || null,
    body:        msg.body || null,
    type:        msg.type,
    timestamp:   msg.timestamp,
    has_media:   msg.hasMedia ? 1 : 0,
  });
}

module.exports = { saveMessage };
