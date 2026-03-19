'use strict';

const fs = require('fs');
const initSqlJs = require('sql.js');
const nodemailer = require('nodemailer');
const config = require('./config.json');

// ---------------------------------------------------------------------------
// AI SUMMARY PLACEHOLDER
// When you're ready to add AI summaries:
// 1. Add your API key to config.json as "aiApiKey"
// 2. Install your AI SDK (e.g. npm install @anthropic-ai/sdk)
// 3. Implement the body of this function to call the API and return a string
// ---------------------------------------------------------------------------
async function generateAiSummary(groupName, messages) {
  // if (!config.aiApiKey) return null;
  // Example (Anthropic):
  //   const Anthropic = require('@anthropic-ai/sdk');
  //   const client = new Anthropic({ apiKey: config.aiApiKey });
  //   const text = messages.map(m => `${m.sender_name || m.sender_id}: ${m.body}`).join('\n');
  //   const resp = await client.messages.create({
  //     model: 'claude-opus-4-6',
  //     max_tokens: 256,
  //     messages: [{ role: 'user', content: `Summarize this WhatsApp group conversation from "${groupName}":\n\n${text}` }],
  //   });
  //   return resp.content[0].text;
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toObjects(result) {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

function formatTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildGroupTable(rows) {
  const tableStyle = 'border-collapse:collapse;width:100%;margin-bottom:8px;';
  const thStyle = 'background:#f3f4f6;border:1px solid #d1d5db;padding:8px 12px;text-align:left;font-size:13px;white-space:nowrap;';
  const tdStyle = 'border:1px solid #d1d5db;padding:8px 12px;font-size:13px;vertical-align:top;';
  const tdTimeStyle = tdStyle + 'white-space:nowrap;color:#6b7280;';
  const tdSenderStyle = tdStyle + 'white-space:nowrap;font-weight:600;';

  const rows_html = rows.map(row => {
    const sender = row.sender_name || row.sender_id || 'unknown';
    const body = row.body
      ? row.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : `<em style="color:#9ca3af;">&lt;${row.type}&gt;</em>`;
    return `
      <tr>
        <td style="${tdTimeStyle}">${formatTime(row.timestamp)}</td>
        <td style="${tdSenderStyle}">${sender.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
        <td style="${tdStyle}">${body}</td>
      </tr>`;
  }).join('');

  return `
    <table style="${tableStyle}">
      <thead>
        <tr>
          <th style="${thStyle}">Time</th>
          <th style="${thStyle}">Sender</th>
          <th style="${thStyle}">Message</th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>`;
}

async function buildEmailHtml(unrecapped, groups) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const h2Style = 'margin:24px 0 8px;font-size:16px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:4px;';
  const summaryStyle = 'background:#f0fdf4;border-left:4px solid #22c55e;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#166534;';

  let sections = '';
  for (const [groupName, rows] of Object.entries(groups)) {
    const summary = await generateAiSummary(groupName, rows);
    const summaryBlock = summary
      ? `<div style="${summaryStyle}"><strong>AI Summary:</strong> ${summary.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
      : '';
    sections += `
      <h2 style="${h2Style}">${groupName.replace(/&/g, '&amp;').replace(/</g, '&lt;')} <span style="font-weight:normal;font-size:13px;color:#6b7280;">(${rows.length} message${rows.length === 1 ? '' : 's'})</span></h2>
      ${summaryBlock}
      ${buildGroupTable(rows)}`;
  }

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#374151;">
  <h1 style="font-size:20px;margin-bottom:4px;">WhatsApp Group Recap</h1>
  <p style="color:#6b7280;margin:0 0 16px;font-size:13px;">${date} &mdash; ${unrecapped.length} message${unrecapped.length === 1 ? '' : 's'} across ${Object.keys(groups).length} group${Object.keys(groups).length === 1 ? '' : 's'}</p>
  ${sections}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main: load DB, send email, mark recap=1
// ---------------------------------------------------------------------------
(async () => {
  const DB_PATH = 'messages.db';
  if (!fs.existsSync(DB_PATH)) process.exit(0);

  const SQL = await initSqlJs({
    locateFile: file => `${__dirname}/node_modules/sql.js/dist/${file}`,
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const unrecapped = toObjects(db.exec(`
    SELECT id, group_name, sender_name, sender_id, body, type, timestamp, has_media
    FROM messages
    WHERE recap = 0
    ORDER BY group_name, timestamp
  `));

  if (unrecapped.length === 0) process.exit(0);

  const groups = {};
  for (const row of unrecapped) {
    const name = row.group_name || '(unknown group)';
    if (!groups[name]) groups[name] = [];
    groups[name].push(row);
  }

  const html = await buildEmailHtml(unrecapped, groups);

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: true,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password,
    },
  });

  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  await transporter.sendMail({
    from: config.smtp.user,
    to: config.recipientEmails.join(', '),
    subject: `WhatsApp Recap — ${date}`,
    html,
  });

  db.run('BEGIN');
  for (const row of unrecapped) {
    db.run('UPDATE messages SET recap = 1 WHERE id = ?', [row.id]);
  }
  db.run('COMMIT');
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  console.log(`Recap sent: ${unrecapped.length} messages across ${Object.keys(groups).length} groups.`);
})().catch(err => {
  console.error('Recap failed:', err.message);
  process.exit(1);
});
