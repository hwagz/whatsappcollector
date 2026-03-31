'use strict';

const fs = require('fs');
const initSqlJs = require('sql.js');
const config = require('./config.json');

const DB_PATH = 'messages.db';

const useAllowedGroups = config.useAllowedGroups;
const allowedGroups = config.allowedGroups || [];
const ignoredGroups = config.ignoredGroups || [];

if (useAllowedGroups && allowedGroups.length === 0) {
  console.log('useAllowedGroups is true but allowedGroups is empty — this would delete everything. Aborting.');
  process.exit(1);
}

if (!useAllowedGroups && ignoredGroups.length === 0) {
  console.log('No ignoredGroups in config.json. Nothing to do.');
  process.exit(0);
}

(async () => {
  const SQL = await initSqlJs({
    locateFile: file => `${__dirname}/node_modules/sql.js/dist/${file}`,
  });

  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  if (useAllowedGroups) {
    // Delete any message whose group is NOT in allowedGroups
    const placeholders = allowedGroups.map(() => '?').join(', ');
    const lower = allowedGroups.map(n => n.toLowerCase());
    const countResult = db.exec(
      `SELECT COUNT(*) FROM messages WHERE LOWER(group_name) NOT IN (${placeholders})`,
      lower,
    );
    const count = countResult[0]?.values[0][0] ?? 0;
    db.run(
      `DELETE FROM messages WHERE LOWER(group_name) NOT IN (${placeholders})`,
      lower,
    );
    console.log(`Whitelist mode: deleted ${count} message(s) from non-allowed groups.`);
  } else {
    // Delete messages from each ignored group
    for (const name of ignoredGroups) {
      const result = db.exec(
        `SELECT COUNT(*) FROM messages WHERE LOWER(group_name) = LOWER('${name.replace(/'/g, "''")}')`,
      );
      const count = result[0]?.values[0][0] ?? 0;
      if (count === 0) {
        console.log(`"${name}": no messages found, skipping.`);
        continue;
      }
      db.run(`DELETE FROM messages WHERE LOWER(group_name) = LOWER(:name)`, { ':name': name });
      console.log(`"${name}": deleted ${count} message(s).`);
    }
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('Done.');
})().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
