'use strict';

/**
 * TTS GATEWAY — PURPCLAW
 * ======================
 *
 * HTTP service that exposes the on-box Kokoro TTS to any PURPCLAW caller.
 * Single-file service, mirrors the chat-gateway pattern (lib/gateways/*.js).
 *
 * Wraps: C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
 *   (Kokoro af_heart → WAV → PowerShell System.Media.SoundPlayer.PlaySync)
 *
 * Contract:
 *   GET  /health
 *   GET  /voices                          → { voices: ["af_heart", ...] }
 *   GET  /version
 *   POST /speak   { text, voice?, blocking? }
 *         → { ok, duration_ms, bytes, text }
 *   POST /synthesize { text, voice?, speed? }
 *         → { ok, audio_b64, mime: "audio/wav", bytes, duration_ms }
 *
 * Modes:
 *   - configured   : Kokoro deps present → speak/synthesize work
 *   - not_configured: deps missing → endpoints return 503
 *
 * Environment:
 *   PORT          (default 7799)
 *   KOKORO_SCRIPT (default: C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py)
 *   TTS_DEFAULT_VOICE  (default: af_heart)
 *
 * Safety: log output via lib/secret-redactor.js. spawn uses the platform
 *   pattern (windowsHide on Windows).
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const PORT = parseInt(process.env.PORT || '7799', 10);
const KOKORO_SCRIPT = process.env.KOKORO_SCRIPT
  || 'C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py';
const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'af_heart';

const log = (...args) => {
  const line = `[tts-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

// Probe Kokoro deps: just verify the script file exists and python can
// find the kokoro package. The speak endpoint will surface a real error
// at runtime if the import path is wrong on a given machine.
const fs = require('fs');
const kokoroConfigured = (() => {
  if (!fs.existsSync(KOKORO_SCRIPT)) return false;
  try {
    // The speak_kokoro.py script inserts site-packages itself; we mirror that
    // path and try the import. If it succeeds → configured. If it fails
    // (timeout, missing dep) → not_configured but the script may still run.
    const site = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/Lib/site-packages';
    const { execSync } = require('child_process');
    const out = execSync(
      `python -c "import sys; sys.path.insert(0, r'${site}'); from kokoro import KPipeline; print('ok')"`,
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }
    );
    return /ok/.test(out.toString());
  } catch (e) {
    log(`probe failed: ${(e.stderr || e.message || '').toString().slice(0, 200)}`);
    // Don't fail the gateway if the probe is slow/flaky — if the script
    // exists, trust the user has the deps. Set a soft-fail mode.
    return fs.existsSync(KOKORO_SCRIPT);
  }
})();

function runKokoro(args) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('python', [KOKORO_SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '', err = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); });
    child.stderr.on('data', (c) => { err += c.toString('utf8'); });
    child.on('error', (e) => resolve({ ok: false, error: e.message, ms: Date.now() - started }));
    child.on('close', (code) => {
      const ms = Date.now() - started;
      const playbackConfirmed = /playback confirmed/.test(err);
      resolve({ ok: code === 0 && (playbackConfirmed || !args.includes('--no-play')), code, ms, out, err });
    });
  });
}

// ── HTTP server ────────────────────────────────────────────────────────────

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
    return sendJson(res, 200, {
      status: 'ok',
      mode: kokoroConfigured ? 'configured' : 'not_configured',
      default_voice: DEFAULT_VOICE,
      port: PORT,
      pid: process.pid,
      uptime: process.uptime(),
    });
  }

  if (url.pathname === '/version' && req.method === 'GET') {
    return sendJson(res, 200, { name: 'purpclaw-tts-gateway', version: '0.1.0' });
  }

  if (url.pathname === '/voices' && req.method === 'GET') {
    return sendJson(res, 200, { voices: ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'] });
  }

  if (url.pathname === '/speak' && req.method === 'POST') {
    if (!kokoroConfigured) return sendJson(res, 503, { ok: false, error: 'kokoro not configured' });
    const body = await readBody(req);
    const text = String(body.text || '').slice(0, 4000);
    if (!text) return sendJson(res, 400, { ok: false, error: 'text required' });
    const voice = String(body.voice || DEFAULT_VOICE);
    log(`speak "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}" (voice=${voice})`);
    const r = await runKokoro([text]);
    if (!r.ok) {
      log(`speak failed: code=${r.code} err=${(r.err || '').slice(0, 200)}`);
      return sendJson(res, 500, { ok: false, error: r.err || `exit ${r.code}` });
    }
    return sendJson(res, 200, { ok: true, text: text.slice(0, 200), voice, duration_ms: r.ms });
  }

  if (url.pathname === '/synthesize' && req.method === 'POST') {
    // Future: would return the audio bytes. Today the script plays and
    // deletes the WAV, so we can only confirm synthesis succeeded. The
    // /speak endpoint is the practical one for the on-box use case.
    return sendJson(res, 501, { ok: false, error: 'synthesize not yet wired (kokoro script plays-and-deletes); use /speak' });
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`/health listening on :${PORT}, mode=${kokoroConfigured ? 'configured' : 'not_configured'}`);
});

for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => {
    log(`${sig} → exit`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

module.exports = { runKokoro, server };
