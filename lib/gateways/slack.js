'use strict';

/**
 * SLACK GATEWAY ADAPTER — PURPCLAW
 * =================================
 *
 * Mirrors lib/gateways/telegram.js. Bridges PURPCLAW /api/chat (port 7780)
 * to a Slack bot via the Web API.
 *
 * Transport: REST polling via conversations.history (no Events webhook
 * required, so no public URL or ngrok).
 *
 * Environment:
 *   SLACK_BOT_TOKEN             xoxb-... — required to actually poll
 *   SLACK_CHANNEL_IDS           comma-separated channel IDs to watch
 *   POLL_INTERVAL_MS            (optional, default 5000)
 *   PURPCLAW_API_URL            (optional, default http://127.0.0.1:7780)
 *   PORT                        (optional, default 7797)  /health endpoint
 *
 * Safety: same pattern as telegram/discord — token goes through
 * lib/secret-redactor.js for log output, no-op if token missing.
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const TOKEN_NAME = ['SLACK', 'BOT', 'TOKEN'].join('_');
const TOKEN = process.env[TOKEN_NAME] || '';
const CHANNEL_IDS = (process.env.SLACK_CHANNEL_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const API_URL = process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';
const PORT = parseInt(process.env.PORT || '7797', 10);

const log = (...args) => {
  const line = `[slack-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

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

function slack(method, params) {
  if (!TOKEN) throw new Error('SLACK_BOT_TOKEN not set');
  const qs = new URLSearchParams(params || {}).toString();
  const pathStr = `/api/${method}${qs ? '?' + qs : ''}`;
  return httpRequest(`https://slack.com${pathStr}`, {
    method: 'GET',
    headers: { 'authorization': `Bearer ${TOKEN}` },
    timeoutMs: 30000,
  }).then((r) => {
    const json = JSON.parse(r.text);
    if (!json.ok) throw new Error(`slack ${method}: ${json.error || r.text.slice(0, 200)}`);
    return json;
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
    if (out) return String(out).slice(0, 38000); // slack 40k char cap
  }
  if (chatResult?.mission?.summary) return String(chatResult.mission.summary).slice(0, 38000);
  return '🤖 (no response shape recognised)';
}

const lastSeen = new Map(); // channelId -> last ts

async function pollChannel(channelId) {
  const oldest = lastSeen.get(channelId) || (Date.now() / 1000 - 60).toString(); // last 60s
  let json;
  try {
    json = await slack('conversations.history', { channel: channelId, oldest, limit: '20' });
  } catch (e) {
    log(`poll ${channelId} error:`, e.message);
    return;
  }
  // Slack returns newest-first
  for (const msg of (json.messages || []).slice().reverse()) {
    if (!msg.text) continue;
    if (msg.subtype === 'bot_message') continue; // ignore other bots
    if (msg.bot_id) continue;
    lastSeen.set(channelId, msg.ts);
    const text = String(msg.text).slice(0, 4000);
    log(`<- ${channelId}/${msg.user || '?'}: ${text.slice(0, 80)}`);
    try {
      const result = await purpclawChat(text, { spawnAgents: true });
      const reply = shapeReply(result);
      await slack('chat.postMessage', { channel: channelId, text: reply });
      log(`-> ${channelId}: ${reply.slice(0, 80)}`);
    } catch (e) {
      log(`chat error for ${channelId}:`, e.message);
      try { await slack('chat.postMessage', { channel: channelId, text: `⚠️ error: ${e.message.slice(0, 200)}` }); } catch {}
    }
  }
}

async function pollOnce() {
  for (const cid of CHANNEL_IDS) {
    await pollChannel(cid);
  }
}

async function pollLoop() {
  log(`polling ${CHANNEL_IDS.length} channel(s), interval ${POLL_INTERVAL_MS}ms`);
  while (!stopping) {
    await pollOnce();
    if (!stopping) await sleep(POLL_INTERVAL_MS);
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
      res.end(JSON.stringify({ name: 'purpclaw-slack-gateway', version: '0.1.0' }));
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
    log('SLACK_BOT_TOKEN not set — booting in not_configured mode (no polling, health is 200)');
  } else {
    log(`token loaded, ${CHANNEL_IDS.length} channel(s), target chat api ${API_URL}`);
    slack('auth.test').then((r) => {
      log(`bot validated: ${r.user} in team ${r.team}`);
    }).catch((e) => log('auth.test error:', e.message));
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

module.exports = { main, shapeReply, slack, purpclawChat, pollOnce, startHealth };
