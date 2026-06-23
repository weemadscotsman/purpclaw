'use strict';

/**
 * Secret redactor — mask API keys and tokens in any string before printing/logging.
 *
 * Two surfaces:
 *   redact(str)           → string with secrets replaced by ****…last4
 *   sanitizeApiKey(raw)   → cleaned key + diagnostics (whitespace, wrap chars, halving)
 *   maskForDisplay(key)   → "sk-ab****wxyz"  for confirmation prompts
 *   wrapStream(stream)    → wraps stdout/stderr to auto-redact every write
 *
 * Patterns recognised (intentionally conservative — only high-confidence matches):
 *   - sk-... / sk_live_... (OpenAI / Stripe style)
 *   - Anthropic sk-ant-...
 *   - MiniMax / generic JWT-style (eyJ... base64 with dots)
 *   - Long opaque hex/base64 blobs >= 32 chars on a token-looking line
 *   - Bearer <token>
 *   - X-Worker-Token: <hex>
 *   - Any value in an env line LLM_API_KEY=... / *_API_KEY=... / *_TOKEN=... / *_SECRET=...
 */

const RE = [
  // env-var lines — `KEY=value`  (also catches *_URL when the value contains a `token=…` query param)
  { re: /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PASSWD))=([^\s"']+)/g,
    map: (m, k, v) => `${k}=${maskForDisplay(v)}` },

  // URL query-param tokens: ?token=… / &token=… / ?access_token=… / ?key=…
  { re: /\b(token|access_token|api_key|apikey|key|auth)=([A-Za-z0-9+/=._\-]{12,})/gi,
    map: (m, p, t) => `${p}=${maskForDisplay(t)}` },

  // Bearer tokens
  { re: /\b(Bearer\s+)([A-Za-z0-9._\-]{16,})/gi,
    map: (m, p, t) => `${p}${maskForDisplay(t)}` },

  // JWT (eyJ…)
  { re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
    map: (m) => maskForDisplay(m) },

  // sk-... / sk_live_... / sk-ant-... — OpenAI/Stripe/Anthropic
  { re: /\bsk[-_](?:ant[-_])?(?:live[-_]|test[-_])?[A-Za-z0-9_\-]{20,}\b/g,
    map: (m) => maskForDisplay(m) },

  // Long hex blobs (>= 40 chars, common for SHA, HMAC keys, worker secrets)
  { re: /\b[a-f0-9]{40,}\b/g,
    map: (m) => maskForDisplay(m) },

  // X-Worker-Token / X-Worker-Sig header values
  { re: /\b(x-worker-(?:token|sig)\s*[:=]\s*)([A-Za-z0-9+/=._\-]{16,})/gi,
    map: (m, p, t) => `${p}${maskForDisplay(t)}` },
];

function maskForDisplay(v) {
  if (typeof v !== 'string') v = String(v || '');
  v = v.trim();
  if (v.length <= 8) return '****';
  if (v.length <= 16) return v.slice(0, 2) + '****' + v.slice(-2);
  return v.slice(0, 6) + '…' + '*'.repeat(4) + v.slice(-4);
}

function redact(input) {
  if (input == null) return input;
  let s = typeof input === 'string' ? input : String(input);
  for (const { re, map } of RE) s = s.replace(re, map);
  return s;
}

/**
 * Sanitize a pasted API key.
 * Returns { value, warnings, ok }.
 *
 * Catches: leading/trailing whitespace, wrapping quotes, terminal echo asterisks,
 * doubled keys (paste-twice bug), control chars.
 */
function sanitizeApiKey(raw) {
  const warnings = [];
  if (raw == null) return { value: '', warnings: ['empty'], ok: false };

  let v = String(raw);

  // Strip control chars and the literal `*` echo char that some terminals capture
  const beforeCtl = v.length;
  v = v.replace(/[\x00-\x1f\x7f]/g, '');
  if (v.length !== beforeCtl) warnings.push('stripped control characters');

  const beforeStar = v.length;
  v = v.replace(/\*/g, '');
  if (v.length !== beforeStar) warnings.push('stripped masking asterisks (terminal echo bleed)');

  // Trim whitespace
  const trimmed = v.trim();
  if (trimmed !== v) warnings.push('trimmed surrounding whitespace');
  v = trimmed;

  // Strip wrapping quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
    warnings.push('stripped wrapping quotes');
  }

  // Detect doubled key (paste-twice). If length is even and first half === second half, halve it.
  if (v.length >= 40 && v.length % 2 === 0) {
    const half = v.length / 2;
    if (v.slice(0, half) === v.slice(half)) {
      v = v.slice(0, half);
      warnings.push('detected duplicated key — kept first half only');
    }
  }

  // Suspicious chars after cleaning
  if (/\s/.test(v)) warnings.push('still contains whitespace inside key');
  if (v.length < 8) warnings.push('key looks too short');
  if (v.length > 500) warnings.push('key looks unusually long');

  return { value: v, warnings, ok: v.length >= 8 && !/\s/.test(v) };
}

/**
 * Wrap a writable stream so every write() call gets redacted.
 * Used to belt-and-brace the wizard against pasting + echoing a key.
 *   const restore = wrapStream(process.stdout);
 *   try { ... } finally { restore(); }
 */
function wrapStream(stream) {
  const orig = stream.write.bind(stream);
  stream.write = function patchedWrite(chunk, ...rest) {
    try {
      if (typeof chunk === 'string') chunk = redact(chunk);
      else if (Buffer.isBuffer(chunk)) chunk = Buffer.from(redact(chunk.toString('utf8')), 'utf8');
    } catch { /* fall through with original chunk */ }
    return orig(chunk, ...rest);
  };
  return function restore() { stream.write = orig; };
}

module.exports = { redact, sanitizeApiKey, maskForDisplay, wrapStream };
