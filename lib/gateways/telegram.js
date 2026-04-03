'use strict';

/**
 * TELEGRAM GATEWAY ADAPTER — PURPCLAW
 * =====================================
 *
 * Bridges the unified PURPCLAW chat API (port 7780 /api/chat) to a Telegram
 * bot, so a single conversation state spans CLI, web, and Telegram — and any
 * future chat platform that copies this pattern.
 *
 * Wire model:
 *   [Telegram]  --HTTPS long-poll-->  [THIS]  --HTTP POST-->  [unified_api:7780 /api/chat]
 *        ^                                                        |
 *        |_________________  sendMessage reply  _________________|
 *
 * Environment:
 *   TELEGRAM_BOT_TOKEN    required to actually poll; otherwise the service
 *                         boots in a no-op "not configured" mode
 *   TELEGRAM_POLL_TIMEOUT (optional, default 25)  long-poll seconds
 *   PURPCLAW_API_URL      (optional, default http://127.0.0.1:7780)
 *   PORT                  (optional, default 7795)  /health endpoint
 *
 * Safety:
 *   - No edits to existing services
 *   - Uses the platform spawn pattern (detached / windowsHide / unref) where it spawns
 *   - All log output is wrapped through lib/secret-redactor.js so tokens never leak
 *   - No webhook required — long-polling means zero public-internet surface
 *   - If token missing → /health returns 200 with `mode: 'not_configured'`; no crash
 *
 * Companion parity check lives in lib/feature-parity.js (Telegram adapter file check).
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor;
try {
  redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js'));
} catch {
  redactor = { redact: (s) => String(s) };
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const POLL_TIMEOUT = parseInt(process.env.TELEGRAM_POLL_TIMEOUT || '25', 10);
const API_URL = process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';
const PORT = parseInt(process.env.PORT || '7795', 10);

const log = (...args) => {
  const line = `[telegram-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

// ── low-level http(s) helpers ─────────────────────────────────────────────

function httpRequest(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlString); } catch (e) { return reject(e); }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: options.headers || {},
      timeout: options.timeoutMs || 15000,
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode || 0, text, headers: res.headers });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function telegram(method, body) {
  if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const data = JSON.stringify(body);
  return httpRequest(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
    timeoutMs: 30000,
  }, data).then((r) => JSON.parse(r.text));
}

function purpclawChat(message, opts = {}) {
  const body = JSON.stringify({ message, spawnAgents: opts.spawnAgents !== false });
  return httpRequest(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    timeoutMs: 60000,
  }, body).then((r) => {
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`chat api ${r.status}: ${r.text.slice(0, 200)}`);
    }
    return JSON.parse(r.text);
  });
}

// ── reply shaping ────────────────────────────────────────────────────────

function shapeReply(chatResult) {
  // /api/chat returns { responses: [{ source, ... }], mission, ... }
  // We synthesise a short human-readable line. If a kernel job was created,
  // surface that; otherwise show the orchestrator result if any.
  const responses = Array.isArray(chatResult?.responses) ? chatResult.responses : [];
  const kernel = responses.find((r) => r.source === 'api-kernel' && r.jobId);
  const orchestrator = responses.find((r) => r.source === 'orchestrator');
  const ball = responses.find((r) => r.source === 'ball');

  if (kernel) {
    return `🔧 routed → job ${kernel.jobId} (${kernel.route || 'kernel'}) · ${kernel.status}`;
  }
  if (orchestrator) {
    const out = orchestrator.result || orchestrator.output || orchestrator.response;
    if (out) return String(out).slice(0, 3800);
  }
  if (ball) return `📡 forwarded to ball`;
  if (chatResult?.mission?.summary) return String(chatResult.mission.summary).slice(0, 3800);
  return '🤖 (no response shape recognised)';
}

// ── long-poll loop ───────────────────────────────────────────────────────

let offset = 0;
let stopping = false;
let inFlight = false;

async function pollOnce() {
  if (inFlight) return;
  inFlight = true;
  try {
    const data = JSON.stringify({ offset, timeout: POLL_TIMEOUT, allowed_updates: ['message'] });
    const res = await httpRequest(`https://api.telegram.org/bot${TOKEN}/getUpdates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      timeoutMs: (POLL_TIMEOUT + 10) * 1000,
    }, data);
    const json = JSON.parse(res.text);
    if (!json.ok) {
      log('getUpdates error:', json.description || res.text.slice(0, 200));
      await sleep(5000);
      return;
    }
    for (const update of json.result || []) {
      offset = Math.max(offset, update.update_id + 1);
      const msg = update.message || update.edited_message;
      if (!msg || !msg.text) continue;
      const chatId = msg.chat?.id;
      const text = String(msg.text).slice(0, 4000);
      if (!chatId) continue;
      log(`<- chat ${chatId}: ${text.slice(0, 80)}`);

      // Per-chat serial processing keeps replies in order
      try {
        const result = await purpclawChat(text, { spawnAgents: true });
        const reply = shapeReply(result);
        await telegram('sendMessage', { chat_id: chatId, text: reply, disable_web_page_preview: true });
        log(`-> chat ${chatId}: ${reply.slice(0, 80)}`);
      } catch (e) {
        log('chat error:', e.message);
        try {
          await telegram('sendMessage', { chat_id: chatId, text: `⚠️ error: ${e.message.slice(0, 200)}` });
        } catch {}
      }
    }
  } catch (e) {
    log('poll error:', e.message);
    await sleep(5000);
  } finally {
    inFlight = false;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pollLoop() {
  log(`starting long-poll loop, timeout=${POLL_TIMEOUT}s`);
  while (!stopping) {
    await pollOnce();
  }
}

// ── health server ────────────────────────────────────────────────────────

function startHealth() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/health') {
      const body = {
        status: 'ok',
        mode: TOKEN ? 'polling' : 'not_configured',
        api: API_URL,
        port: PORT,
        pid: process.pid,
        uptime: process.uptime(),
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    if (url.pathname === '/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'purpclaw-telegram-gateway', version: '0.1.0' }));
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(PORT, '127.0.0.1', () => log(`/health listening on :${PORT}`));
  return server;
}

// ── shutdown ─────────────────────────────────────────────────────────────

function shutdown(signal, server) {
  log(`received ${signal}, shutting down`);
  stopping = true;
  setTimeout(() => process.exit(0), 1500).unref();
  if (server) server.close();
}

// ── main ─────────────────────────────────────────────────────────────────

function main() {
  if (!TOKEN) {
    log('TELEGRAM_BOT_TOKEN not set — booting in not_configured mode (no polling, health is 200)');
  } else {
    log(`token loaded, target chat api ${API_URL}`);
    // validate token once at boot
    telegram('getMe', {}).then((r) => {
      if (r.ok) log(`bot validated: @${r.result.username}`);
      else log('getMe failed:', r.description);
    }).catch((e) => log('getMe error:', e.message));
  }
  const server = startHealth();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    process.on(sig, () => shutdown(sig, server));
  }
  if (TOKEN) {
    pollLoop().catch((e) => { log('poll loop crashed:', e.message); process.exit(1); });
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, shapeReply, telegram, purpclawChat, pollOnce, startHealth };
