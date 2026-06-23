'use strict';
/**
 * lib/providers/hermes-cli.js — Hermes CLI bridge driver.
 *
 * Stubs structured provider events by spawning `hermes` CLI subprocesses
 * and parsing the output. Emits canonical { type: 'token' | 'done' | 'error' } events.
 *
 * This is the lowest-priority adapter per the report. Use as a fallback
 * when no native API is available. For tool support, use the MCP adapter
 * instead.
 *
 * Auth: HERMES_API_KEY env or Nous Portal OAuth (out of scope for CLI bridge).
 */

const { spawn } = require('child_process');
const { Readable } = require('stream');

async function* hermesCliDriver(input) {
  const hermesPath = process.env.HERMES_CLI_PATH || 'hermes';
  const args = [
    'run',
    '--print',
    '--yolo',
    '--model', input.model || 'auto',
    '--prompt', messagesToPrompt(input.messages || []),
  ];

  let child;
  try {
    child = spawn(hermesPath, args, {
      env: { ...process.env, HERMES_NO_TUI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    yield { type: 'error', code: 'spawn_failed', message: e.message };
    return;
  }

  // Consume stdout as a stream, yielding one token per non-empty line.
  const lines = child.stdout.pipe(new ReadableStreamToLines());
  for await (const line of lines) {
    if (line.trim()) yield { type: 'token', text: line + '\n' };
  }

  // After stdout is done, wait for the child to exit.
  const exitInfo = await new Promise((resolve) => {
    let stderrBuf = '';
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8'); });
    child.on('close', (code) => resolve({ code, stderr: stderrBuf }));
    child.on('error', (e) => resolve({ code: -1, stderr: e.message }));
  });

  if (exitInfo.code !== 0) {
    yield { type: 'error', code: `exit_${exitInfo.code}`, message: exitInfo.stderr.slice(0, 400) };
    return;
  }
  yield { type: 'done' };
}

const { Transform } = require('stream');

class ReadableStreamToLines extends Transform {
  constructor() {
    super({ encoding: 'utf8' });
    this._buf = '';
  }
  _transform(chunk, _enc, cb) {
    this._buf += chunk;
    const lines = this._buf.split('\n');
    this._buf = lines.pop() || '';
    for (const line of lines) this.push(line);
    cb();
  }
  _flush(cb) {
    if (this._buf) this.push(this._buf);
    cb();
  }
}

function messagesToPrompt(messages) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n\n');
}

module.exports = {
  name: 'hermes_cli',
  streamMode: 'none',
  authType: 'none',
  streamRun: hermesCliDriver,
  healthCheck: async () => {
    return new Promise((resolve) => {
      const child = spawn(process.env.HERMES_CLI_PATH || 'hermes', ['--version'], { stdio: 'ignore' });
      child.on('close', (code) => resolve({ ok: code === 0, detail: code === 0 ? 'hermes CLI present' : 'not found' }));
      child.on('error', () => resolve({ ok: false, detail: 'hermes CLI not on PATH' }));
    });
  },
};
