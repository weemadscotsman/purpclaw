'use strict';

/**
 * TTS GATEWAY — PURPCLAW
 * ======================
 *
 * HTTP service that exposes the on-box Kokoro TTS to any PURPCLAW caller.
 * Wraps: C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py
 *
 * Uses a persistent Python worker (stdin/stdout JSON IPC) so the ONNX model
 * stays loaded between requests — first call warms up (~90s cold), subsequent
 * calls are fast (~1-5s).
 *
 * Contract:
 *   GET  /health
 *   GET  /voices                          → { voices: ["af_heart", ...] }
 *   GET  /version
 *   POST /speak   { text, voice? }
 *         → { ok, duration_ms, text }
 *   POST /synthesize { text, voice? }
 *         → { ok, audio_b64, mime: "audio/wav", bytes, duration_ms }
 *
 * Environment:
 *   PORT          (default 7799)
 *   KOKORO_SCRIPT (default: C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py)
 *   PYTHON_BIN    (default: system Python with pygame)
 *   TTS_DEFAULT_VOICE  (default: af_heart)
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor = null;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const PYTHON_BIN = process.env.PYTHON_BIN
  || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
const PORT = parseInt(process.env.PORT || '7799', 10);
const KOKORO_SCRIPT = process.env.KOKORO_SCRIPT
  || path.join(__dirname, 'kokoro_worker.py');
const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'af_heart';

const log = (...args) => {
  const line = `[tts-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

// ── Persistent Kokoro worker via stdin/stdout JSON IPC ──────────────────────
//
// Worker protocol (both directions use newline-delimited JSON):
//   → {"cmd":"init"}                      bootstrap the KPipeline
//   ← {"ok":true}                        or {"ok":false,"error":"..."}
//   → {"cmd":"speak","id":<int>,"text":"...","voice":"af_heart","wavPath":"..."}
//   ← {"id":<int>,"ok":true,"ms":123}    or {"id":<int>,"ok":false,"error":"..."}
//
// The Python side reads messages from stdin, writes responses to stdout.

let worker = null;
let workerReady = false;
let workerBusy = false;
let requestId = 0;
const pending = new Map(); // id → { resolve, reject, timeout }

function startWorker() {
  worker = spawn(PYTHON_BIN, [KOKORO_SCRIPT, '--ipc'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  worker.stdout.setEncoding('utf8');
  worker.stderr.setEncoding('utf8');

  let buf = '';
  worker.stdout.on('data', (chunk) => {
    buf += chunk;
    let newline;
    while ((newline = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, newline).trim();
      buf = buf.slice(newline + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        handleWorkerMessage(msg);
      } catch { log('worker parse error:', line.slice(0, 100)); }
    }
  });

  worker.stderr.on('data', (chunk) => {
    // ONNX/huggingface logs go to stderr — suppress absl warnings
    const str = chunk.toString();
    if (str.includes('absl::InitializeLog') || str.includes('oneDNN custom operations')) return;
    process.stderr.write(str);
  });

  worker.on('error', (e) => log('worker error:', e.message));
  worker.on('exit', (code, sig) => {
    log(`worker exited code=${code} sig=${sig}`);
    worker = null;
    workerReady = false;
    // Reject all pending
    for (const [id, p] of pending) { p.reject(new Error('worker exited')); }
    pending.clear();
    workerBusy = false;
  });

  // Send init command
  sendWorker({ cmd: 'init' });
}

function sendWorker(msg) {
  if (!worker) return false;
  worker.stdin.write(JSON.stringify(msg) + '\n');
  return true;
}

function handleWorkerMessage(msg) {
  if (msg.cmd === 'ready') {
    workerReady = true;
    log('worker ready — Kokoro model loaded');
    return;
  }
  if (typeof msg.id === 'number' && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(p.timeout);
    if (p.clear) p.clear();
    workerBusy = false;
    if (msg.ok) p.resolve({ ms: msg.ms || 0 });
    else p.reject(new Error(msg.error || 'worker error'));
    return;
  }
}

function workerRequest(text, voice, wavPath, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('worker not running')); return; }
    workerBusy = true;
    const id = ++requestId;
    const sent = sendWorker({ cmd: 'speak', id, text, voice, wavPath: wavPath || '' });
    if (!sent) { workerBusy = false; reject(new Error('worker stdin closed')); return; }
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        workerBusy = false;
        reject(new Error('timeout'));
      }
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout: timer, clear: () => { workerBusy = false; } });
  });
}

// ── Worker bootstrap probe ─────────────────────────────────────────────────

const fs = require('fs');
const kokoroConfigured = fs.existsSync(KOKORO_SCRIPT) && fs.existsSync(PYTHON_BIN);

// ── HTTP server ────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    'Connection': 'close', // prevent HTTP keep-alive from holding connections
  });
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
      mode: kokoroConfigured ? (workerReady ? 'ready' : 'warming') : 'not_configured',
      default_voice: DEFAULT_VOICE,
      port: PORT,
      pid: process.pid,
      uptime: process.uptime(),
    });
  }

  if (url.pathname === '/version' && req.method === 'GET') {
    return sendJson(res, 200, { name: 'purpclaw-tts-gateway', version: '0.2.0' });
  }

  if (url.pathname === '/voices' && req.method === 'GET') {
    return sendJson(res, 200, { voices: ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'] });
  }

  if (url.pathname === '/speak' && req.method === 'POST') {
    if (!kokoroConfigured) return sendJson(res, 503, { ok: false, error: 'kokoro not configured' });
    if (!worker) return sendJson(res, 503, { ok: false, error: 'worker not running' });
    const body = await readBody(req);
    const text = String(body.text || '').slice(0, 4000);
    if (!text) return sendJson(res, 400, { ok: false, error: 'text required' });
    const voice = String(body.voice || DEFAULT_VOICE);
    log(`speak "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}" (voice=${voice})`);
    try {
      const r = await workerRequest(text, voice, '', 120000);
      return sendJson(res, 200, { ok: true, text: text.slice(0, 200), voice, duration_ms: r.ms });
    } catch (e) {
      log(`speak failed: ${e.message}`);
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  // POST /stop — kill current playback, restart worker fresh
  if (url.pathname === '/stop' && req.method === 'POST') {
    if (worker) {
      // Reject any pending request
      for (const [id, p] of pending) { try { p.reject(new Error('interrupted')); } catch {} }
      pending.clear();
      workerBusy = false;
      worker.kill();
      worker = null;
      workerReady = false;
      log('playback stopped by client');
    }
    sendJson(res, 200, { ok: true, stopped: !!worker });
    // Auto-restart worker asynchronously
    setTimeout(() => { if (!worker) startWorker(); }, 500);
    return;
  }

  // GET /state — current playback state
  if (url.pathname === '/state' && req.method === 'GET') {
    return sendJson(res, 200, {
      workerReady,
      workerBusy,
      pending: pending.size,
    });
  }

  if (url.pathname === '/synthesize' && req.method === 'POST') {
    if (!kokoroConfigured) return sendJson(res, 503, { ok: false, error: 'kokoro not configured' });
    if (!worker) return sendJson(res, 503, { ok: false, error: 'worker not running' });
    const body = await readBody(req);
    const text = String(body.text || '').slice(0, 4000);
    if (!text) return sendJson(res, 400, { ok: false, error: 'text required' });
    const voice = String(body.voice || DEFAULT_VOICE);
    const os = require('os');
    const tempWav = path.join(os.tmpdir(), `synth_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.wav`);
    log(`synthesize "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}" → ${path.basename(tempWav)}`);
    try {
      await workerRequest(text, voice, tempWav, 120000);
      if (!fs.existsSync(tempWav)) throw new Error('wav file not created');
      const buf = fs.readFileSync(tempWav);
      fs.unlinkSync(tempWav);
      return sendJson(res, 200, {
        ok: true,
        audio_b64: buf.toString('base64'),
        mime: 'audio/wav',
        bytes: buf.length,
      });
    } catch (e) {
      log(`synthesize failed: ${e.message}`);
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`/health listening on :${PORT}, mode=${kokoroConfigured ? 'configured' : 'not_configured'}`);
  if (kokoroConfigured) {
    log('starting persistent Kokoro worker...');
    startWorker();
  }
});

for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => {
    log(`${sig} → exit`);
    if (worker) { worker.stdin.end(); worker.kill(); }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

module.exports = { server };
