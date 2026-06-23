'use strict';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMITS = {
  read: 900,
  write: 120,
  stream: 60,
};

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isEnabled() {
  return process.env.PURPCLAW_RATE_LIMIT !== '0';
}

function clientId(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  return forwarded || realIp || req.socket.remoteAddress || 'unknown';
}

function defaultBucket(req, pathname) {
  if (pathname === '/api/stream' || pathname === '/api/events') return 'stream';
  if (req.method === 'GET' || req.method === 'HEAD') return 'read';
  return 'write';
}

function sendLimited(res, payload, corsHeaders = {}) {
  const retryAfterSec = Math.max(1, Math.ceil(payload.retryAfterMs / 1000));
  res.writeHead(429, {
    'Content-Type': 'application/json',
    'Retry-After': String(retryAfterSec),
    'X-RateLimit-Limit': String(payload.limit),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.ceil(payload.resetAt / 1000)),
    ...corsHeaders,
  });
  res.end(JSON.stringify({
    error: 'rate_limited',
    bucket: payload.bucket,
    limit: payload.limit,
    windowMs: payload.windowMs,
    retryAfterMs: payload.retryAfterMs,
  }));
}

function createRateLimiter(options = {}) {
  const service = options.service || 'purpclaw';
  const windowMs = options.windowMs || envInt('PURPCLAW_RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS);
  const limits = {
    read: options.readLimit || envInt('PURPCLAW_RATE_LIMIT_READ', DEFAULT_LIMITS.read),
    write: options.writeLimit || envInt('PURPCLAW_RATE_LIMIT_WRITE', DEFAULT_LIMITS.write),
    stream: options.streamLimit || envInt('PURPCLAW_RATE_LIMIT_STREAM', DEFAULT_LIMITS.stream),
    ...(options.limits || {}),
  };
  const bypass = new Set(options.bypass || ['/health', '/api/health']);
  const classify = options.classify || defaultBucket;
  const entries = new Map();
  let lastSweep = 0;

  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }

  function check(req, pathname) {
    if (!isEnabled()) return { allowed: true, disabled: true };
    if (req.method === 'OPTIONS' || bypass.has(pathname)) return { allowed: true, bypassed: true };

    const bucket = classify(req, pathname);
    const limit = limits[bucket] || limits.read;
    const now = Date.now();
    const resetAt = now + windowMs;
    sweep(now);

    const key = `${service}:${clientId(req)}:${bucket}`;
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt };
      entries.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, limit - entry.count);
    return {
      allowed: entry.count <= limit,
      bucket,
      count: entry.count,
      limit,
      remaining,
      resetAt: entry.resetAt,
      retryAfterMs: Math.max(1, entry.resetAt - now),
      windowMs,
    };
  }

  function apply(req, res, pathname, corsHeaders = {}) {
    const result = check(req, pathname);
    if (result.allowed) return false;
    sendLimited(res, result, corsHeaders);
    return true;
  }

  return { apply, check, entries };
}

module.exports = {
  DEFAULT_LIMITS,
  DEFAULT_WINDOW_MS,
  createRateLimiter,
};
