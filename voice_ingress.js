'use strict';
/**
 * VOICE INGRESS — the wire that makes the stack voice-first.
 *
 * STT (:7896) /listen/stream  →  Orchestrator (:7784) /api/orchestrate
 *                             →  EventBus (:7782) publish {topic:'voice.command', command}
 *
 * Optional wake word via VOICE_WAKE_WORD (empty = every final transcript dispatches).
 */

const http = require('http');

const STT_PORT = parseInt(process.env.STT_PORT || '7896', 10);
const ORCHESTRATOR_PORT = parseInt(process.env.ORCHESTRATOR_PORT || '7784', 10);
const EVENTBUS_PORT = parseInt(process.env.EVENTBUS_PORT || '7782', 10);
const WAKE_WORD = (process.env.VOICE_WAKE_WORD || '').trim().toLowerCase();
const MIN_WORDS = parseInt(process.env.VOICE_MIN_WORDS || '2', 10);

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
let attempts = 0;

function postJson(port, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1', port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 120000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function dispatch(text) {
  console.log(`[VOICE-INGRESS] dispatching: "${text}"`);
  // Fire-and-record on the bus regardless of orchestrator outcome.
  postJson(EVENTBUS_PORT, '/publish', { topic: 'voice.command', command: text, source: 'voice_ingress', ts: Date.now() })
    .catch(e => console.warn('[VOICE-INGRESS] eventbus publish failed:', e.message));
  try {
    const result = await postJson(ORCHESTRATOR_PORT, '/api/orchestrate', { command: text });
    console.log(`[VOICE-INGRESS] workflow ${result.workflowId || '?'} → ${result.status || result.error || 'unknown'}`);
  } catch (e) {
    console.error('[VOICE-INGRESS] orchestrator dispatch failed:', e.message);
  }
}

function shouldDispatch(text) {
  if (!text) return null;
  let t = text.trim();
  if (WAKE_WORD) {
    const lower = t.toLowerCase();
    const idx = lower.indexOf(WAKE_WORD);
    if (idx === -1) return null;
    t = t.slice(idx + WAKE_WORD.length).replace(/^[\s,.:;!-]+/, '');
  }
  if (t.split(/\s+/).filter(Boolean).length < MIN_WORDS) return null;
  return t;
}

function startMic() {
  postJson(STT_PORT, '/listen/start', {})
    .then(() => console.log('[VOICE-INGRESS] mic capture started'))
    .catch(e => console.warn('[VOICE-INGRESS] /listen/start failed (will rely on stream):', e.message));
}

function subscribe() {
  const req = http.request({
    hostname: '127.0.0.1', port: STT_PORT, path: '/listen/stream', method: 'GET',
    headers: { Accept: 'text/event-stream' },
  }, res => {
    if (res.statusCode !== 200) { res.resume(); return scheduleReconnect(`HTTP ${res.statusCode}`); }
    attempts = 0;
    console.log('[VOICE-INGRESS] subscribed to STT transcript stream');
    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'connected') continue;
          const command = shouldDispatch(event.text);
          if (command) dispatch(command);
        } catch { /* non-JSON keepalive */ }
      }
    });
    res.on('end', () => scheduleReconnect('stream ended'));
    res.on('error', e => scheduleReconnect(e.message));
  });
  req.on('error', e => scheduleReconnect(e.message));
  req.end();
}

function scheduleReconnect(reason) {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempts++), MAX_DELAY_MS);
  console.warn(`[VOICE-INGRESS] STT stream down (${reason}) — retry in ${delay}ms`);
  setTimeout(() => { startMic(); subscribe(); }, delay);
}

console.log(`[VOICE-INGRESS] stt=:${STT_PORT} orchestrator=:${ORCHESTRATOR_PORT} eventbus=:${EVENTBUS_PORT} wake="${WAKE_WORD || '(none)'}"`);
startMic();
subscribe();
