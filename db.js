'use strict';

const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = 'messages.db';

let db;

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: file => `${__dirname}/node_modules/sql.js/dist/${file}`,
  });

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

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
      media_path  TEXT,
      recap       INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_group_id  ON messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);

  // Migrations for columns added after initial schema
  const colResult = db.exec('PRAGMA table_info(messages)');
  const colNames = colResult.length ? colResult[0].values.map(r => r[1]) : [];
  if (!colNames.includes('recap')) {
    db.exec('ALTER TABLE messages ADD COLUMN recap INTEGER NOT NULL DEFAULT 0');
  }
  if (!colNames.includes('media_path')) {
    db.exec('ALTER TABLE messages ADD COLUMN media_path TEXT');
  }

  saveDb();
}

function saveMessage(msg, chat, contact, mediaPath) {
  db.run(
    `INSERT OR IGNORE INTO messages
      (wid, group_id, group_name, sender_id, sender_name, body, type, timestamp, has_media, media_path)
     VALUES
      (:wid, :group_id, :group_name, :sender_id, :sender_name, :body, :type, :timestamp, :has_media, :media_path)`,
    {
      ':wid':         msg.id._serialized,
      ':group_id':    msg.from,
      ':group_name':  chat.name || null,
      ':sender_id':   msg.author || null,
      ':sender_name': contact.pushname || null,
      ':body':        msg.body || null,
      ':type':        msg.type,
      ':timestamp':   msg.timestamp,
      ':has_media':   msg.hasMedia ? 1 : 0,
      ':media_path':  mediaPath || null,
    }
  );
  saveDb();
}

module.exports = { initDb, saveMessage };
