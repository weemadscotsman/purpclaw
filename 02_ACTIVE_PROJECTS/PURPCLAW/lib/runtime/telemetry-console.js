'use strict';

const telemetry = require('./pipeline-telemetry');

let installed = false;
const recent = new Map();

function stringify(args) {
  return args.map(arg => {
    if (arg instanceof Error) return `${arg.message}\n${arg.stack || ''}`.trim();
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }).join(' ');
}

function inferStatus(level, message) {
  if (level === 'error') return 'error';
  if (level === 'warn') return 'warning';
  if (/\b(error|failed|crash|fatal|exception|timeout|unhandled)\b/i.test(message)) return 'error';
  return 'info';
}

function dedupeKeyFor(service, level, message) {
  const normalized = message
    .replace(/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<time>')
    .replace(/\b\d{10,}\b/g, '<id>')
    .replace(/\b\d+\b/g, '<n>')
    .slice(0, 220);
  return `${service}:${level}:${normalized}`;
}

function installConsoleTelemetry(service, opts = {}) {
  if (installed || process.env.PURPCLAW_CONSOLE_TELEMETRY_DISABLED === '1') return;
  installed = true;
  const maxLength = Number(opts.maxLength || process.env.PURPCLAW_CONSOLE_TELEMETRY_MAX || 1600);
  const dedupeMs = Number(opts.dedupeMs || process.env.PURPCLAW_CONSOLE_TELEMETRY_DEDUPE_MS || 30000);
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  for (const level of ['log', 'warn', 'error']) {
    console[level] = (...args) => {
      original[level](...args);
      try {
        const message = stringify(args);
        if (!message) return;
        if (service === 'purpclaw-eventbus' && /\bPublished:\s*system\.health\b/i.test(message)) return;
        if (/\bGET \/cognitive\/health\b/.test(message)) return;
        const status = inferStatus(level, message);
        const key = dedupeKeyFor(service, level, message);
        const last = recent.get(key) || 0;
        if (status !== 'error' && Date.now() - last < dedupeMs) return;
        recent.set(key, Date.now());
        if (recent.size > 1000) {
          for (const [k, at] of recent) {
            if (Date.now() - at > dedupeMs * 4) recent.delete(k);
          }
        }
        telemetry.record({
          service,
          component: 'console',
          event: 'console',
          level: level === 'log' ? 'info' : level,
          status,
          message: message.length > maxLength ? `${message.slice(0, maxLength)} [truncated]` : message,
        });
      } catch {}
    };
  }

  process.on('uncaughtException', error => {
    try {
      telemetry.record({
        service,
        component: 'process',
        event: 'uncaughtException',
        status: 'error',
        level: 'error',
        error: error?.stack || error?.message || String(error),
      });
    } catch {}
  });

  process.on('unhandledRejection', reason => {
    try {
      telemetry.record({
        service,
        component: 'process',
        event: 'unhandledRejection',
        status: 'error',
        level: 'error',
        error: reason?.stack || reason?.message || String(reason),
      });
    } catch {}
  });
}

module.exports = { installConsoleTelemetry };
