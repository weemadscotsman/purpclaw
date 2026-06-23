'use strict';

/**
 * STT GATEWAY — PURPCLAW
 * =======================
 *
 * HTTP service that exposes on-box STT (faster-whisper) to any
 * PURPCLAW caller. Single-file service, mirrors lib/tts/gateway.js.
 *
 * Wraps: C:/Users/Admin/AppData/Local/hermes/scripts/transcribe.py
 *   (faster-whisper WhisperModel → CPU int8 inference)
 *
 * Contract:
 *   GET  /health
 *   GET  /version
 *   POST /transcribe  (multipart with 'audio' file)
 *   POST /transcribe_path { audio_path }
 *         → { ok, language, duration, segments: [...], text }
 *
 * Modes:
 *   - configured   : faster-whisper installed → /transcribe works
 *   - not_configured: deps missing → endpoints return 503
 *
 * Environment:
 *   PORT          (default 7896)
 *   TRANSCRIBE_SCRIPT (default: .../hermes/scripts/transcribe.py)
 *   STT_MODEL     (default: "base", options: tiny/base/small/medium/large-v3)
 *   STT_LANG      (default: "en")
 *   STT_BEAM      (default: 5)
 *
 * v1.0 — first ship of the STT service. Mirrors tts/gateway.js exactly.
 */

const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '7896', 10);
const TRANSCRIBE_SCRIPT = process.env.TRANSCRIBE_SCRIPT
  || 'C:/Users/Admin/AppData/Local/hermes/scripts/transcribe.py';
const MODEL = process.env.STT_MODEL || 'base';
const LANG  = process.env.STT_LANG  || 'en';
const BEAM  = process.env.STT_BEAM  || '5';

const log = (...args) => {
  const ts = new Date().toISOString();
  console.log(`[stt-gateway ${ts}]`, ...args);
};

// venv-aware python discovery (same trick as the tts gateway)
const VENV_SCRIPTS = 'C:/Users/Admin/AppData/Local/hermes/hermes-agent/venv/Scripts';
function pythonCmd() {
  const candidate = path.join(VENV_SCRIPTS, 'python.exe');
  return fs.existsSync(candidate) ? candidate : 'python';
}

// ── Modes ─────────────────────────────────────────────────────────────────
const isConfigured = (() => {
  try {
    return fs.existsSync(TRANSCRIBE_SCRIPT);
  } catch { return false; }
})();
const MODE = isConfigured ? 'configured' : 'not_configured';
log(`mode: ${MODE}, model: ${MODEL}, lang: ${LANG}, beam: ${BEAM}`);

// ── Transcribe (calls the python helper) ──────────────────────────────────
function runTranscribe(audioPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    const env = { ...process.env, PATH: `${VENV_SCRIPTS};${process.env.PATH || ''}`, STT_MODEL: MODEL, STT_LANG: LANG, STT_BEAM: BEAM };
    const child = spawn(pythonCmd(), [TRANSCRIBE_SCRIPT, audioPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });
    let out = '', err = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); });
    child.stderr.on('data', (c) => { err += c.toString('utf8'); });
    child.on('error', (e) => resolve({ ok: false, error: e.message, ms: Date.now() - started }));
    child.on('close', (code) => {
      const ms = Date.now() - started;
      if (code !== 0) return resolve({ ok: false, code, ms, err, out });
      try {
        const json = JSON.parse(out);
        resolve({ ok: true, ms, ...json });
      } catch (e) {
        resolve({ ok: false, error: 'parse: ' + e.message, ms, out, err });
      }
    });
  });
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    'access-control-allow-origin': '*',
  });
  res.end(text);
}

// ── Multipart parser (minimal, for /transcribe) ──────────────────────────
const formidable = (() => {
  // Tiny multipart parser: finds the boundary, reads the first file
  // part named 'audio'. Avoids the formidable dependency.
  function parse(req) {
    return new Promise((resolve, reject) => {
      const ctype = req.headers['content-type'] || '';
      const m = ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!m) return reject(new Error('no multipart boundary'));
      const boundary = '--' + (m[1] || m[2]);
      const chunks = [];
      let total = 0;
      const LIMIT = 50 * 1024 * 1024; // 50MB cap
      req.on('data', (c) => {
        total += c.length;
        if (total > LIMIT) { req.destroy(); reject(new Error('upload too large')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        // Find the first file part
        const start = body.indexOf(boundary);
        if (start < 0) return reject(new Error('boundary not found'));
        let pos = start + boundary.length;
        if (body.slice(pos, pos + 2).toString() === '--') return resolve(null); // end
        pos += 2; // skip CRLF
        const headerEnd = body.indexOf('\r\n\r\n', pos);
        if (headerEnd < 0) return reject(new Error('header end not found'));
        const headerText = body.slice(pos, headerEnd).toString();
        const nameMatch = headerText.match(/name="([^"]+)"/);
        const filenameMatch = headerText.match(/filename="([^"]+)"/);
        const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
        pos = headerEnd + 4;
        // Find end of this part
        const partEnd = body.indexOf(boundary, pos);
        if (partEnd < 0) return reject(new Error('part end not found'));
        const data = body.slice(pos, partEnd - 2); // strip CRLF before boundary
        resolve({
          name: nameMatch && nameMatch[1],
          filename: filenameMatch && filenameMatch[1],
          contentType: contentTypeMatch && contentTypeMatch[1].trim(),
          data,
        });
      });
      req.on('error', reject);
    });
  }
  return { parse };
})();

// ── HTTP server ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', mode: MODE, model: MODEL, lang: LANG, port: PORT, uptime: process.uptime() });
  }
  if (url.pathname === '/version') {
    return sendJson(res, 200, {
      name: 'purpclaw-stt-gateway',
      version: '1.0',
      model: MODEL, lang: LANG, beam: BEAM,
      script: TRANSCRIBE_SCRIPT,
      mode: MODE,
    });
  }
  if (url.pathname === '/transcribe_path' && req.method === 'POST') {
    if (MODE !== 'configured') return sendJson(res, 503, { error: 'not_configured' });
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { audio_path } = JSON.parse(body || '{}');
        if (!audio_path || !fs.existsSync(audio_path)) {
          return sendJson(res, 400, { error: 'audio_path missing or not found' });
        }
        const r = await runTranscribe(audio_path);
        if (!r.ok) return sendJson(res, 500, { error: r.error || 'transcribe failed', stderr: r.err });
        delete r.out; delete r.err; // trim noisy fields
        return sendJson(res, 200, r);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }
  if (url.pathname === '/transcribe' && req.method === 'POST') {
    if (MODE !== 'configured') return sendJson(res, 503, { error: 'not_configured' });
    try {
      const part = await formidable.parse(req);
      if (!part || !part.data || part.data.length === 0) {
        return sendJson(res, 400, { error: 'no audio file in upload' });
      }
      // Write the upload to a temp file
      const tmp = path.join(os.tmpdir(), `purpclaw_stt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`);
      fs.writeFileSync(tmp, part.data);
      try {
        const r = await runTranscribe(tmp);
        if (!r.ok) return sendJson(res, 500, { error: r.error || 'transcribe failed', stderr: r.err });
        delete r.out; delete r.err;
        return sendJson(res, 200, r);
      } finally {
        try { fs.unlinkSync(tmp); } catch (_) {}
      }
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  log('═══════════════════════════════════════════════');
  log('PURPCLAW STT Gateway v1.0');
  log('═══════════════════════════════════════════════');
  log('Port: ' + PORT);
  log(`Model: ${MODEL}  Lang: ${LANG}  Beam: ${BEAM}`);
  log('Features: faster-whisper CPU int8, multipart + path upload, segments+text');
  log('═══════════════════════════════════════════════');
  log('Listening for transcribe requests');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log(`Port ${PORT} in use — gateway already running?`);
  } else {
    log(`server error: ${e.message}`);
  }
});
