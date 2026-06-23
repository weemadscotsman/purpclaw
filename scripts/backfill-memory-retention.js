'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const retention = require('../lib/memory-retention');
const sessions = require('../lib/session-store');

const ROOT = path.resolve(__dirname, '..');
const MAX_CHARS = Number(process.env.MEMORY_BACKFILL_CHUNK_CHARS || 20000);
const MAX_FILE_BYTES = Number(process.env.MEMORY_BACKFILL_MAX_FILE_BYTES || 512 * 1024);
const INCLUDE_SERVICE_LOGS = process.env.MEMORY_BACKFILL_INCLUDE_SERVICE_LOGS === '1';

function readText(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_FILE_BYTES) {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(MAX_FILE_BYTES);
    fs.readSync(fd, buf, 0, MAX_FILE_BYTES, 0);
    fs.closeSync(fd);
    return `${buf.toString('utf8')}\n[backfill truncated: file is ${stat.size} bytes]`;
  }
  return fs.readFileSync(file, 'utf8');
}

function chunks(text, size = MAX_CHARS) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

function rememberFile(file, kind, source, importance = 0.45) {
  if (!fs.existsSync(file)) return 0;
  let count = 0;
  const text = readText(file);
  chunks(text).forEach((chunk, index) => {
    if (!chunk.trim()) return;
    retention.remember(kind, `[${kind}] ${file}\nchunk=${index}\n${chunk}`, {
      key: `backfill:${kind}:${file}:${index}`,
      source,
      type: kind,
      importance,
      metadata: { file, chunkIndex: index, backfill: true },
    });
    count += 1;
  });
  return count;
}

async function main() {
  const summary = {
    sessions: 0,
    sessionMessages: 0,
    files: 0,
    chunks: 0,
  };

  for (const meta of sessions.listSessions(10000)) {
    const session = sessions.loadSession(meta.id);
    if (!session) continue;
    retention.rememberChatSession(session);
    summary.sessions += 1;
    summary.sessionMessages += Array.isArray(session.messages) ? session.messages.length : 0;
  }

  const files = [
    [path.join(ROOT, 'agent_work', 'trace', 'events.jsonl'), 'trace_backfill', 'trace.backfill', 0.45],
    [path.join(ROOT, 'agent_work', 'evolution-log.jsonl'), 'evolution_log_backfill', 'evolution.backfill', 0.65],
    [path.join(ROOT, 'audit.fallback.log'), 'audit_log_backfill', 'audit.backfill', 0.55],
  ];
  if (INCLUDE_SERVICE_LOGS) {
    files.push(
      [path.join(ROOT, 'logs', 'services', 'purpclaw-cognitive-out.log'), 'service_log_backfill', 'logs.backfill', 0.45],
      [path.join(ROOT, 'logs', 'services', 'purpclaw-cognitive-error.log'), 'service_log_backfill', 'logs.backfill', 0.7],
    );
  }

  for (const [file, kind, source, importance] of files) {
    if (!fs.existsSync(file)) continue;
    summary.files += 1;
    summary.chunks += rememberFile(file, kind, source, importance);
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
  await retention.flushQueue();
  console.log(JSON.stringify({
    ok: true,
    summary,
    journal: retention.JOURNAL_FILE,
    state: retention.STATE_FILE,
    sessionsDir: path.join(os.homedir(), '.purpclaw', 'sessions'),
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
