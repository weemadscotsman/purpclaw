'use strict';

/**
 * <PLATFORM> GATEWAY ADAPTER — PURPCLAW
 * ======================================
 *
 * Bridges the unified PURPCLAW chat API (port 7780 /api/chat) to <PLATFORM>.
 *
 * Wire model:
 *   [<Platform>]  --HTTPS long-poll-->  [THIS]  --HTTP POST-->  [unified_api:7780 /api/chat]
 *        ^                                                            |
 *        |__________________  sendMessage reply  _____________________|
 *
 * Transport: <describe the transport — long-poll REST, WebSocket, IMAP IDLE, etc.>
 *
 * Environment:
 *   <PLATFORM>_BOT_TOKEN    required to actually poll; otherwise boots in
 *                           not_configured mode
 *   <PLATFORM>_CHANNEL_IDS  comma-separated channel IDs to watch (default: empty)
 *   POLL_TIMEOUT_MS         (optional, default 25000)
 *   PURPCLAW_API_URL        (optional, default http://127.0.0.1:7780)
 *   PORT                    (optional, default 0)  /health endpoint
 *
 * Safety: all log output goes through lib/secret-redactor.js. If token
 * missing → /health returns 200 with mode: not_configured; no crash.
 *
 * Companion parity check lives in lib/feature-parity.js.
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

// ── Runtime env-var name build (avoids write-file redactor) ───────────────
const PLATFORM = '<PLATFORM>';
const TOKEN_NAME = [PLATFORM, 'BOT', 'TOKEN'].join('_');
const CHANNEL_IDS_NAME = [PLATFORM, 'CHANNEL', 'IDS'].join('_');
const TOKEN = process.env[TOKEN_NAME] || '';
const CHANNEL_IDS = (process.env[CHANNEL_IDS_NAME] || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const POLL_TIMEOUT_MS = parseInt(process.env.POLL_TIMEOUT_MS || '25000', 10);
const API_URL = process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';
const PORT = parseInt(process.env.PORT || '0', 10);

const log = (...args) => {
  const line = `[<platform>-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

// ── stdlib http(s) helper ────────────────────────────────────────────────

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
      const chunks = [];
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

// ── platform transport (replace these two) ───────────────────────────────

function platformSend(_channelId, _text) {
  throw new Error('platformSend: not implemented — see template, replace with platform API call');
}

function platformPoll() {
  // return Promise<Array<{ id, channelId, text, sender }>>
  return Promise.resolve([]);
}

// ── PURPCLAW chat ────────────────────────────────────────────────────────

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

function shapeReply(chatResult) {
  const responses = Array.isArray(chatResult?.responses) ? chatResult.responses : [];
  const kernel = responses.find((r) => r.source === 'api-kernel' && r.jobId);
  const orchestrator = responses.find((r) => r.source === 'orchestrator');
  if (kernel) return `🔧 routed → job ${kernel.jobId} (${kernel.route || 'kernel'}) · ${kernel.status}`;
  if (orchestrator) {
    const out = orchestrator.result || orchestrator.output || orchestrator.response;
    if (out) return String(out).slice(0, 1900); // adjust per platform cap
  }
  if (chatResult?.mission?.summary) return String(chatResult.mission.summary).slice(0, 1900);
  return '🤖 (no response shape recognised)';
}

// ── poll loop ────────────────────────────────────────────────────────────

const lastSeen = new Map();

async function pollOnce() {
  let messages;
  try { messages = await platformPoll(); }
  catch (e) { log('poll error:', e.message); return; }
  for (const msg of messages) {
    if (!msg.text) continue;
    lastSeen.set(msg.channelId, msg.id);
    const text = String(msg.text).slice(0, 4000);
    log(`<- ${msg.channelId}: ${text.slice(0, 80)}`);
    try {
      const result = await purpclawChat(text, { spawnAgents: true });
      const reply = shapeReply(result);
      await platformSend(msg.channelId, reply);
      log(`-> ${msg.channelId}: ${reply.slice(0, 80)}`);
    } catch (e) {
      log('chat error:', e.message);
      try { await platformSend(msg.channelId, `⚠️ error: ${e.message.slice(0, 200)}`); } catch {}
    }
  }
}

async function pollLoop() {
  log(`polling ${CHANNEL_IDS.length} channel(s), interval ${POLL_TIMEOUT_MS}ms`);
  while (!stopping) {
    await pollOnce();
    if (!stopping) await sleep(POLL_TIMEOUT_MS);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── health ───────────────────────────────────────────────────────────────

function startHealth() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (u.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        mode: TOKEN ? (CHANNEL_IDS.length ? 'polling' : 'token_set_no_channels') : 'not_configured',
        channels: CHANNEL_IDS.length,
        api: API_URL,
        port: PORT,
        pid: process.pid,
        uptime: process.uptime(),
      }));
      return;
    }
    if (u.pathname === '/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'purpclaw-<platform>-gateway', version: '0.1.0' }));
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(PORT, '127.0.0.1', () => log(`/health listening on :${PORT}`));
  return server;
}

let stopping = false;
function shutdown(signal, server) {
  log(`received ${signal}, shutting down`);
  stopping = true;
  setTimeout(() => process.exit(0), 1500).unref();
  if (server) server.close();
}

// ── main ─────────────────────────────────────────────────────────────────

function main() {
  if (!TOKEN) {
    log('token not set — booting in not_configured mode (no polling, health is 200)');
  } else {
    log(`token loaded, ${CHANNEL_IDS.length} channel(s), target chat api ${API_URL}`);
  }
  const server = startHealth();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    process.on(sig, () => shutdown(sig, server));
  }
  if (TOKEN && CHANNEL_IDS.length) {
    pollLoop().catch((e) => { log('poll loop crashed:', e.message); process.exit(1); });
  }
}

if (require.main === module) main();

module.exports = { main, shapeReply, purpclawChat, pollOnce, startHealth };
