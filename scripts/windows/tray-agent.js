#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/paths');
const computerUse = require('../../lib/runtime/computer-use');
const { dispatchVoiceCommand } = require('../../lib/runtime/voice-router');

const PORT = Number(process.env.PURPCLAW_TRAY_PORT || 7796);
const TOKEN_FILE = path.join(PROJECT_ROOT, 'agent_work', '.tray-token');

function token() {
  try {
    const existing = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch {}
  const created = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, created, { encoding: 'utf8', mode: 0o600 });
  return created;
}

const authToken = token();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1') {
    return json(res, 403, { ok: false, error: 'localhost only' });
  }
  if (req.url === '/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'purpclaw-tray-agent', port: PORT, mode: computerUse.mode() });
  }
  if (req.headers.authorization !== `Bearer ${authToken}`) {
    return json(res, 401, { ok: false, error: 'unauthorized' });
  }
  if (req.url === '/action' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1024 * 1024) return json(res, 413, { ok: false, error: 'body too large' });
    }
    try {
      const body = JSON.parse(raw || '{}');
      const result = await computerUse.execute(body.action, body.args || {}, { approved: body.approved === true });
      return json(res, 200, { ok: true, result });
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message });
    }
  }
  if (req.url === '/voice' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1024 * 1024) return json(res, 413, { ok: false, error: 'body too large' });
    }
    try {
      const body = JSON.parse(raw || '{}');
      const result = await dispatchVoiceCommand(body.text || body.command, {
        source: 'windows-tray',
        approved: body.approved === true,
      });
      return json(res, result.status === 'approval_required' ? 409 : 202, result);
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message });
    }
  }
  return json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[tray-agent] listening on 127.0.0.1:${PORT}`);
});

function stop() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
