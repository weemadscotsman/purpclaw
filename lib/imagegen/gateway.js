'use strict';

/**
 * IMAGE GEN GATEWAY — PURPCLAW
 * ============================
 *
 * HTTP service that exposes any Stable Diffusion / image-gen backend to
 * PURPCLAW callers. Single-file service, mirrors the TTS gateway pattern
 * (lib/tts/gateway.js) and the chat-gateway pattern (lib/gateways/*.js).
 *
 * Compatible backends:
 *   - AUTOMATIC1111 / Stable Diffusion WebUI
 *       POST {backend}/sdapi/v1/txt2img
 *       body: { prompt, width, height, steps, seed, ... }
 *       returns: { images: ["base64-png", ...] }
 *   - ComfyUI (via its HTTP API — set IMAGEGEN_BACKEND_KIND=comfy)
 *       POST {backend}/prompt
 *   - Any custom backend (override the request adapter)
 *
 * Contract:
 *   GET  /health
 *   GET  /version
 *   GET  /backends                    → { available, mode, default_*
 *   POST /generate   { prompt, width?, height?, steps?, seed?, negative_prompt?, backend? }
 *         → { ok, image_b64, mime, bytes, width, height, steps, seed, duration_ms }
 *   POST /samplers   { backend? }     → { samplers: [...] }   (lists available samplers)
 *
 * Modes:
 *   - configured   : IMAGEGEN_BACKEND_URL is set and reachable
 *   - not_configured: no backend URL → endpoints return 503 with a clear reason
 *
 * Environment:
 *   PORT                  (default 7800)
 *   IMAGEGEN_BACKEND_URL  e.g. http://127.0.0.1:7860
 *   IMAGEGEN_BACKEND_KIND autodetect | a1111 | comfy
 *   IMAGEGEN_DEFAULT_WIDTH  (default 512)
 *   IMAGEGEN_DEFAULT_HEIGHT (default 512)
 *   IMAGEGEN_DEFAULT_STEPS  (default 20)
 *
 * Safety: log output via lib/secret-redactor.js. spawn uses platform pattern.
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor = null;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const PORT = parseInt(process.env.PORT || '7800', 10);
const BACKEND_URL = process.env.IMAGEGEN_BACKEND_URL || '';
const BACKEND_KIND = (process.env.IMAGEGEN_BACKEND_KIND || 'autodetect').toLowerCase();
const DEFAULT_WIDTH = parseInt(process.env.IMAGEGEN_DEFAULT_WIDTH || '512', 10);
const DEFAULT_HEIGHT = parseInt(process.env.IMAGEGEN_DEFAULT_HEIGHT || '512', 10);
const DEFAULT_STEPS = parseInt(process.env.IMAGEGEN_DEFAULT_STEPS || '20', 10);

const log = (...args) => {
  const line = `[imagegen-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

const configured = Boolean(BACKEND_URL);

// ── low-level http(s) helper ──────────────────────────────────────────────

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
      timeout: options.timeoutMs || 120000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode || 0, text: buf.toString('utf8'), buf, headers: res.headers });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function pickKind() {
  if (BACKEND_KIND !== 'autodetect') return BACKEND_KIND;
  // Heuristic: ComfyUI commonly on 8181/8188, A1111 on 7860
  if (BACKEND_URL.includes(':8181') || BACKEND_URL.includes(':8188')) return 'comfy';
  return 'a1111';
}

// ── A1111 adapter ─────────────────────────────────────────────────────────

async function a1111Health() {
  if (!BACKEND_URL) return { online: false };
  try {
    const r = await httpRequest(`${BACKEND_URL}/sdapi/v1/samplers`, { timeoutMs: 5000 });
    if (r.status < 200 || r.status >= 300) return { online: false, reason: `http ${r.status}` };
    return { online: true, samplers: (JSON.parse(r.text) || []).map((s) => s.name) };
  } catch (e) {
    return { online: false, reason: e.message };
  }
}

async function a1111Generate(opts) {
  const body = JSON.stringify({
    prompt: opts.prompt,
    negative_prompt: opts.negative_prompt || '',
    width: opts.width || DEFAULT_WIDTH,
    height: opts.height || DEFAULT_HEIGHT,
    steps: opts.steps || DEFAULT_STEPS,
    seed: opts.seed != null ? opts.seed : -1,
    sampler_name: opts.sampler || 'Euler a',
    cfg_scale: opts.cfg_scale || 7,
    batch_size: 1,
    n_iter: 1,
    save_images: false,
    send_images: true,
  });
  const r = await httpRequest(`${BACKEND_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    timeoutMs: 300000,
  }, body);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`a1111 ${r.status}: ${r.text.slice(0, 300)}`);
  }
  const json = JSON.parse(r.text);
  const b64 = json.images?.[0];
  if (!b64) throw new Error('a1111 returned no images');
  return { image_b64: b64, mime: 'image/png' };
}

// ── HTTP plumbing ────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req, max = 65536) {
  return new Promise((resolve) => {
    let total = 0;
    const chunks = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > max) { req.destroy(); resolve({}); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/health' && req.method === 'GET') {
    const health = configured ? await a1111Health().catch((e) => ({ online: false, reason: e.message })) : { online: false };
    return sendJson(res, 200, {
      status: 'ok',
      mode: configured ? (health.online ? 'live' : 'backend_unreachable') : 'not_configured',
      backend_url: BACKEND_URL || null,
      backend_kind: configured ? pickKind() : null,
      backend_online: health.online,
      defaults: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, steps: DEFAULT_STEPS },
      port: PORT,
      pid: process.pid,
      uptime: process.uptime(),
    });
  }

  if (url.pathname === '/version' && req.method === 'GET') {
    return sendJson(res, 200, { name: 'purpclaw-imagegen-gateway', version: '0.1.0' });
  }

  if (url.pathname === '/backends' && req.method === 'GET') {
    return sendJson(res, 200, {
      configured,
      kind: configured ? pickKind() : null,
      url: BACKEND_URL || null,
      defaults: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, steps: DEFAULT_STEPS },
    });
  }

  if (url.pathname === '/samplers' && req.method === 'GET') {
    if (!configured) return sendJson(res, 503, { ok: false, error: 'no backend configured' });
    const h = await a1111Health();
    if (!h.online) return sendJson(res, 502, { ok: false, error: `backend offline: ${h.reason}` });
    return sendJson(res, 200, { ok: true, samplers: h.samplers || [] });
  }

  if (url.pathname === '/generate' && req.method === 'POST') {
    if (!configured) return sendJson(res, 503, { ok: false, error: 'no IMAGEGEN_BACKEND_URL set' });
    const body = await readBody(req);
    const prompt = String(body.prompt || '').slice(0, 4000);
    if (!prompt) return sendJson(res, 400, { ok: false, error: 'prompt required' });
    const started = Date.now();
    const kind = pickKind();
    log(`generate kind=${kind} prompt="${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`);
    try {
      const result = await a1111Generate({ ...body, prompt });
      const ms = Date.now() - started;
      const bytes = Math.floor((result.image_b64.length * 3) / 4);
      return sendJson(res, 200, {
        ok: true,
        image_b64: result.image_b64,
        mime: result.mime,
        bytes,
        duration_ms: ms,
        params: {
          width: body.width || DEFAULT_WIDTH,
          height: body.height || DEFAULT_HEIGHT,
          steps: body.steps || DEFAULT_STEPS,
        },
      });
    } catch (e) {
      log(`generate failed: ${e.message}`);
      return sendJson(res, 502, { ok: false, error: e.message.slice(0, 300) });
    }
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`/health listening on :${PORT}, mode=${configured ? 'configured' : 'not_configured'}`);
});

for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => {
    log(`${sig} → exit`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

module.exports = { server, a1111Generate, a1111Health };
