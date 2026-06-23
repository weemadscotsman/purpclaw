'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const RETENTION_DIR = path.join(ROOT, 'agent_work', 'memory-retention');
const JOURNAL_FILE = path.join(RETENTION_DIR, 'journal.jsonl');
const STATE_FILE = path.join(RETENTION_DIR, 'state.json');

const REQUESTED_MEMORY_HOST = process.env.MEMORY_HOST || '127.0.0.1';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function localMemoryHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized) || normalized.startsWith('127.')) {
    return normalized === '[::1]' ? '::1' : normalized;
  }
  return '127.0.0.1';
}

const MEMORY_HOST = localMemoryHost(REQUESTED_MEMORY_HOST);
const MEMORY_PORT = Number(process.env.MEMORY_PORT || 7880);
const MEMORY_TIMEOUT_MS = Number(process.env.MEMORY_RETENTION_TIMEOUT_MS || 2500);
const ENABLED = process.env.MEMORY_RETENTION_DISABLED !== '1' && process.env.MEMORY_DISABLED !== '1';

let queue = [];
let flushing = false;
let state = null;

function ensure() {
  fs.mkdirSync(RETENTION_DIR, { recursive: true });
}

function loadState() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    state = { keys: {}, sessions: {} };
  }
  state.keys ||= {};
  state.sessions ||= {};
  return state;
}

function saveState() {
  try {
    ensure();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state || loadState(), null, 2), 'utf8');
  } catch {}
}

function compactText(value, max = 4000) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}\n[truncated ${text.length - max} chars]` : text;
}

function appendJournal(record) {
  try {
    ensure();
    fs.appendFileSync(JOURNAL_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {}
}

function postMemory(body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: MEMORY_HOST,
      port: MEMORY_PORT,
      path: '/memory/ingest',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
      timeout: MEMORY_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, body: JSON.parse(data) }); }
        catch { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, body: data }); }
      });
    });
    req.on('error', error => resolve({ ok: false, error: error.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function enqueue(record) {
  appendJournal(record);
  if (!ENABLED || !record.content) return;
  const st = loadState();
  if (record.key && st.keys[record.key]) return;
  queue.push(record);
  flushSoon();
}

function flushSoon() {
  if (flushing) return;
  flushing = true;
  setTimeout(flushQueue, 10).unref?.();
}

async function flushQueue() {
  while (queue.length) {
    const record = queue.shift();
    const st = loadState();
    if (record.key && st.keys[record.key]) continue;

    const result = await postMemory({
      content: record.content,
      type: record.type || 'retained_event',
      source: record.source || 'memory-retention',
      importance: record.importance ?? 0.45,
      valence: record.valence ?? 0,
      metadata: {
        retention: true,
        key: record.key,
        kind: record.kind,
        journal: JOURNAL_FILE,
        localOnly: true,
        requestedMemoryHost: REQUESTED_MEMORY_HOST,
        memoryHost: MEMORY_HOST,
        ...(record.metadata || {}),
      },
    });

    if (result.ok && record.key) {
      st.keys[record.key] = {
        at: new Date().toISOString(),
        memory_id: result.body?.memory_id || null,
        kind: record.kind,
      };
      const keys = Object.keys(st.keys);
      if (keys.length > 20000) {
        for (const key of keys.slice(0, keys.length - 15000)) delete st.keys[key];
      }
      saveState();
    }
  }
  flushing = false;
}

function remember(kind, content, opts = {}) {
  const at = opts.at || new Date().toISOString();
  const key = opts.key || `${kind}:${at}:${Buffer.from(compactText(content, 200)).toString('base64').slice(0, 80)}`;
  enqueue({
    key,
    kind,
    at,
    content: compactText(content),
    type: opts.type || kind,
    source: opts.source || kind,
    importance: opts.importance,
    valence: opts.valence,
    metadata: opts.metadata || {},
  });
}

function rememberChatSession(session) {
  if (!session || !session.id || !Array.isArray(session.messages)) return;
  const st = loadState();
  const last = st.sessions[session.id]?.messageCount || 0;
  const messages = session.messages.slice(last);
  if (!messages.length) return;

  for (let offset = 0; offset < messages.length; offset += 1) {
    const index = last + offset;
    const message = messages[offset] || {};
    const role = message.role || 'unknown';
    const content = compactText(message.content || message.text || '', 6000);
    if (!content) continue;

    remember('chat_message', [
      `[chat message] session=${session.id} title=${session.title || ''}`,
      `role=${role}`,
      `provider=${session.provider || ''} model=${session.model || ''}`,
      content,
    ].join('\n'), {
      key: `chat:${session.id}:${index}:${role}`,
      source: `chat.${role}`,
      type: 'chat_message',
      importance: role === 'user' ? 0.7 : 0.6,
      metadata: {
        sessionId: session.id,
        title: session.title || '',
        messageIndex: index,
        role,
        provider: session.provider || '',
        model: session.model || '',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    });
  }

  st.sessions[session.id] = {
    messageCount: session.messages.length,
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
  saveState();
}

function rememberTrace(entry = {}) {
  const id = entry.id || `${entry.ts || Date.now()}:${entry.source || 'unknown'}:${entry.action || entry.type || 'event'}`;
  remember('trace_event', [
    `[trace event] ${entry.source || 'unknown'} ${entry.action || entry.type || 'event'} ${entry.status || 'info'}`,
    entry.route ? `route=${entry.route}` : '',
    entry.sessionId ? `session=${entry.sessionId}` : '',
    entry.jobId ? `job=${entry.jobId}` : '',
    compactText(entry.detail || entry.message || entry.payload || '', 2000),
  ].filter(Boolean).join('\n'), {
    key: `trace:${id}`,
    source: `trace.${entry.source || 'unknown'}`,
    type: 'trace_event',
    importance: entry.status === 'error' || entry.status === 'failed' ? 0.75 : 0.35,
    valence: entry.status === 'error' || entry.status === 'failed' ? -0.4 : 0,
    metadata: entry,
  });
}

function rememberRuntimeEvent(event = {}) {
  const namespace = event.namespace || 'event';
  const action = event.action || event.type || 'event';
  remember('runtime_event', [
    `[runtime event] ${namespace}.${action}`,
    `source=${event.source || 'unknown'}`,
    event.step ? `step=${event.step}` : '',
    compactText(event.payload || event.message || '', 2500),
  ].filter(Boolean).join('\n'), {
    key: `event:${event.timestamp || Date.now()}:${namespace}:${action}:${event.source || 'unknown'}`,
    source: `event.${namespace}`,
    type: 'runtime_event',
    importance: namespace === 'memory' ? 0.3 : 0.45,
    metadata: event,
  });
}

module.exports = {
  remember,
  rememberChatSession,
  rememberTrace,
  rememberRuntimeEvent,
  flushQueue,
  JOURNAL_FILE,
  STATE_FILE,
};
