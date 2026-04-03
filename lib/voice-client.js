'use strict';
/**
 * lib/voice-client.js — PURPCLAW Unified Voice Client
 * ====================================================
 * Used by: CLI (purpclaw voice), TUI (V key), Web UI (mic button)
 *
 * TTS: Sends text to voice_coordinator (7781) → Kokoro speaks it locally
 * STT: Subscribes to voice_stt (7896) live stream or POSTs audio for transcription
 * State persisted to: agent_work/voice_state.json
 */

const fs   = require('fs');
const http = require('http');
const net  = require('net');
const path = require('path');

const PURP_DIR    = path.resolve(__dirname, '..');
const STATE_FILE  = path.join(PURP_DIR, 'agent_work', 'voice_state.json');

const VOICE_COORD_PORT = parseInt(process.env.VOICE_PORT    || '7781', 10);
const STT_PORT         = parseInt(process.env.STT_PORT      || '7896', 10);
const STT_HOST         = process.env.STT_HOST || '127.0.0.1';
const COORD_HOST       = '127.0.0.1';

// ── Persistent voice state ────────────────────────────────────────────────────
const DEFAULT_STATE = {
  voiceEnabled  : true,    // TTS on by default
  sttEnabled    : true,    // STT on by default
  listenActive  : false,
  model         : 'base',
  volume        : 1.0,
  lastSpoke     : null,
  lastHeard     : null,
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch {}
  return { ...DEFAULT_STATE };
}

function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8');
  } catch {}
}

// ── TTS — speak via voice_coordinator TCP hybrid server ───────────────────────
/**
 * speak(text) → Promise<{ok, error?}>
 * Sends text to voice_coordinator /api/voice-coord which routes to Kokoro TTS.
 */
function speak(text) {
  return new Promise(resolve => {
    if (!text || !text.trim()) return resolve({ ok: false, error: 'empty text' });

    const body = JSON.stringify({ text: text.trim(), type: 'tts_direct' });
    const req  = http.request({
      hostname: COORD_HOST,
      port    : VOICE_COORD_PORT,
      path    : '/api/voice-coord',
      method  : 'POST',
      headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d) }); }
        catch { resolve({ ok: res.statusCode < 400, raw: d }); }
      });
    });
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();

    const s = loadState();
    s.lastSpoke = new Date().toISOString();
    saveState(s);
  });
}

// ── STT — transcribe a Buffer of audio ────────────────────────────────────────
/**
 * transcribe(audioBuffer, mimeType) → Promise<{text, language, elapsed_sec, error?}>
 */
function transcribe(audioBuffer, mimeType = 'audio/wav') {
  return new Promise(resolve => {
    const req = http.request({
      hostname: STT_HOST,
      port    : STT_PORT,
      path    : '/transcribe',
      method  : 'POST',
      headers : { 'Content-Type': mimeType, 'Content-Length': audioBuffer.length },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(d);
          if (r.text) {
            const s = loadState();
            s.lastHeard = new Date().toISOString();
            saveState(s);
          }
          resolve(r);
        } catch { resolve({ error: 'parse error', raw: d }); }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.message }));
    req.write(audioBuffer);
    req.end();
  });
}

// ── STT — start/stop live mic capture ────────────────────────────────────────
function startListening() {
  return httpPost(STT_PORT, '/listen/start', {});
}

function stopListening() {
  return httpPost(STT_PORT, '/listen/stop', {});
}

function httpPost(port, path_, data) {
  return new Promise(resolve => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: STT_HOST, port, path: path_, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: d }); } });
    });
    req.setTimeout(5000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.message }));
    req.write(body);
    req.end();
  });
}

// ── STT — subscribe to live stream (SSE from voice_stt) ──────────────────────
/**
 * subscribeSTT(onTranscript, onError) → { destroy() }
 * Connects to /listen/stream SSE endpoint. Calls onTranscript({ text, ts, lang }) on each result.
 */
function subscribeSTT(onTranscript, onError) {
  const req = http.request({
    hostname: STT_HOST,
    port    : STT_PORT,
    path    : '/listen/stream',
    headers : { Accept: 'text/event-stream' },
  }, res => {
    let buf = '';
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.text && typeof onTranscript === 'function') {
            onTranscript(evt);
            const s = loadState();
            s.lastHeard = evt.ts || new Date().toISOString();
            saveState(s);
          }
        } catch {}
      }
    });
    res.on('error', e => { if (typeof onError === 'function') onError(e); });
  });
  req.on('error', e => { if (typeof onError === 'function') onError(e); });
  req.end();
  return { destroy: () => { try { req.destroy(); } catch {} } };
}

// ── Health checks ─────────────────────────────────────────────────────────────
function pingTTS() {
  return new Promise(resolve => {
    const req = http.request({ hostname: COORD_HOST, port: VOICE_COORD_PORT, path: '/health' }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ ok: true, ...JSON.parse(d) }); } catch { resolve({ ok: true }); } });
    });
    req.setTimeout(1500, () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.on('error', () => resolve({ ok: false, reason: 'offline' }));
    req.end();
  });
}

function pingSTT() {
  return new Promise(resolve => {
    const req = http.request({ hostname: STT_HOST, port: STT_PORT, path: '/health' }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ ok: true, ...JSON.parse(d) }); } catch { resolve({ ok: true }); } });
    });
    req.setTimeout(1500, () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.on('error', () => resolve({ ok: false, reason: 'offline' }));
    req.end();
  });
}

async function status() {
  const [tts, stt] = await Promise.all([pingTTS(), pingSTT()]);
  const state = loadState();
  return {
    voiceEnabled: state.voiceEnabled,
    sttEnabled  : state.sttEnabled,
    listenActive: state.listenActive,
    tts         : { online: tts.ok, port: VOICE_COORD_PORT },
    stt         : { online: stt.ok, port: STT_PORT, model: stt.model || '?', model_loaded: stt.model_loaded },
    lastSpoke   : state.lastSpoke,
    lastHeard   : state.lastHeard,
  };
}

// ── Toggle helpers ────────────────────────────────────────────────────────────
function enableVoice(tts = true, stt = true) {
  const s = loadState();
  s.voiceEnabled = tts;
  s.sttEnabled   = stt;
  saveState(s);
  return s;
}

function disableVoice() {
  return enableVoice(false, false);
}

// ── CLI helper — announce system events via TTS ───────────────────────────────
/**
 * announce(text) — speaks if voice is enabled, silently skips if not.
 */
async function announce(text) {
  const s = loadState();
  if (!s.voiceEnabled) return { ok: false, reason: 'voice disabled' };
  return speak(text);
}

module.exports = {
  speak,
  transcribe,
  startListening,
  stopListening,
  subscribeSTT,
  pingTTS,
  pingSTT,
  status,
  enableVoice,
  disableVoice,
  announce,
  loadState,
  saveState,
  VOICE_COORD_PORT,
  STT_PORT,
};
