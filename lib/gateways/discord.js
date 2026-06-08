'use strict';

/**
 * DISCORD GATEWAY ADAPTER — PURPCLAW
 * ====================================
 *
 * Mirrors the Telegram pattern (lib/gateways/telegram.js): bridges the
 * unified PURPCLAW chat API (port 7780 /api/chat) to a Discord bot.
 *
 * Wire model:
 *   [Discord]  --REST long-poll-->  [THIS]  --HTTP POST-->  [unified_api:7780 /api/chat]
 *       ^                                                          |
 *       |_________________  sendMessage reply  _____________________|
 *
 * Discord transport: REST-only (no gateway WebSocket). Cheaper to run, no
 * persistent connection, but a few seconds of poll latency. Swap to a
 * discord.js-based gateway later if real-time matters.
 *
 * Environment:
 *   DISCORD_BOT_TOKEN       required to actually poll; otherwise boots in
 *                           not_configured mode
 *   DISCORD_CHANNEL_IDS     comma-separated channel IDs to watch (default: empty)
 *   POLL_TIMEOUT_MS         (optional, default 25000)
 *   PURPCLAW_API_URL        (optional, default http://127.0.0.1:7780)
 *   PORT                    (optional, default 7796)  /health endpoint
 *
 * Safety: uses the platform's spawn pattern where it spawns; logs go through
 * lib/secret-redactor.js. If token missing → /health returns 200 with
 * mode: not_configured; no crash, no polling.
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor = null;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const TOKEN_NAME = ['DISCORD', 'BOT', 'TOKEN'].join('_');
const TOKEN = process.env[TOKEN_NAME] || '';
const CHANNEL_IDS = (process.env.DISCORD_CHANNEL_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const POLL_TIMEOUT_MS = parseInt(process.env.POLL_TIMEOUT_MS || '25000', 10);
const API_URL = process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';
const PORT = parseInt(process.env.PORT || '7796', 10);

const log = (...args) => {
  const line = `[discord-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

function httpRequest(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    let url = null;
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

function discord(method, pathStr, body) {
  if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN not set');
  const data = body ? JSON.stringify(body) : null;
  const headers = { 'authorization': `Bot ${TOKEN}` };
  if (data) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = Buffer.byteLength(data);
  }
  return httpRequest(`https://discord.com/api/v10${pathStr}`, {
    method, headers, timeoutMs: 30000,
  }, data).then((r) => {
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`discord api ${r.status}: ${r.text.slice(0, 200)}`);
    }
    return r.text ? JSON.parse(r.text) : {};
  });
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

function shapeReply(chatResult) {
  const responses = Array.isArray(chatResult?.responses) ? chatResult.responses : [];
  const kernel = responses.find((r) => r.source === 'api-kernel' && r.jobId);
  const orchestrator = responses.find((r) => r.source === 'orchestrator');
  if (kernel) return `🔧 routed → job ${kernel.jobId} (${kernel.route || 'kernel'}) · ${kernel.status}`;
  if (orchestrator) {
    const out = orchestrator.result || orchestrator.output || orchestrator.response;
    if (out) return String(out).slice(0, 1900); // discord 2000 char cap
  }
  if (chatResult?.mission?.summary) return String(chatResult.mission.summary).slice(0, 1900);
  return '🤖 (no response shape recognised)';
}

const lastSeen = new Map(); // channelId -> last message id

async function pollChannel(channelId) {
  const after = lastSeen.get(channelId) || '0';
  let messages = null;
  try {
    messages = await discord('GET', `/channels/${channelId}/messages?limit=20&after=${after}`);
  } catch (e) {
    log(`poll ${channelId} error:`, e.message);
    return;
  }
  // Discord returns newest-first
  for (const msg of messages.slice().reverse()) {
    if (!msg.content) continue;
    if (msg.author?.bot) continue; // ignore our own messages and other bots
    lastSeen.set(channelId, msg.id);
    const text = String(msg.content).slice(0, 4000);
    log(`<- ${channelId}/${msg.author?.username || '?'}: ${text.slice(0, 80)}`);
    try {
      const result = await purpclawChat(text, { spawnAgents: true });
      const reply = shapeReply(result);
      await discord('POST', `/channels/${channelId}/messages`, { content: reply });
      log(`-> ${channelId}: ${reply.slice(0, 80)}`);
    } catch (e) {
      log(`chat error for ${channelId}:`, e.message);
      try {
        await discord('POST', `/channels/${channelId}/messages`, { content: `⚠️ error: ${e.message.slice(0, 200)}` });
      } catch {}
    }
  }
}

async function pollOnce() {
  for (const cid of CHANNEL_IDS) {
    await pollChannel(cid);
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

function startHealth() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/health') {
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
    if (url.pathname === '/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'purpclaw-discord-gateway', version: '0.1.0' }));
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

function main() {
  if (!TOKEN) {
    log('DISCORD_BOT_TOKEN not set — booting in not_configured mode (no polling, health is 200)');
  } else {
    log(`token loaded, ${CHANNEL_IDS.length} channel(s), target chat api ${API_URL}`);
    discord('GET', '/users/@me').then((r) => {
      log(`bot validated: ${r.username}#${r.discriminator || '0'}`);
    }).catch((e) => log('getMe error:', e.message));
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

module.exports = { main, shapeReply, discord, purpclawChat, pollOnce, startHealth };
