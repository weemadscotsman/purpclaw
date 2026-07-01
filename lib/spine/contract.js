'use strict';

/**
 * lib/spine/contract.js — the route contract.
 *
 * One place that defines the 5 terminal states and the SSE event shape
 * the chat stream uses to surface them. The chat wrapper / job-bridge /
 * failure-card builder all read from here so the contract can't drift.
 */

const { TERMINAL_STATUSES } = require('./envelope');

/**
 * SSE event name per terminal status. The cockpit UI listens for these.
 */
const SSE_EVENT_BY_STATUS = {
  answered:   'answer',     // final content ready, content in data.content
  delegated:  'delegated',  // a sub-job is running; data has {jobId, sessionId}
  failed:     'card',       // a visible failure card; data has {title, body, hint, errorCode}
  pending:    'progress',   // optional intermediate progress; data has {step, message}
  'no-output':'card',       // explicit "no result" card so the user knows the job ran
};

/**
 * Human-readable card for a failed / no-output envelope. The cockpit renders
 * this directly. NO silent exits — every failed route produces this.
 */
function buildFailureCard(env) {
  const code = env.errorCode || 'unknown';
  const titleByCode = {
    http_501:   'Route not implemented',
    http_404:   'Route not found',
    rate_limit: 'Rate limit hit',
    unavailable:'Upstream unavailable',
    timeout:    'Route timed out',
    no_output:  'Route produced no output',
    unknown:    'Route failed',
  };
  const hintByCode = {
    http_501:   'This route has not been wired yet. Check the spine wiring for this route name.',
    http_404:   'The target endpoint is missing. Confirm the route exists in unified_api or app/api.',
    rate_limit: 'Wait a few seconds, then retry. Consider using a different provider lane.',
    unavailable:'The upstream service is down or refusing connections. Check pm2 + service health.',
    timeout:    'The route took longer than the watchdog allows. Check the provider and the agent loop.',
    no_output:  'The route completed successfully but returned no content. Check the upstream handler.',
    unknown:    'See env.error.message for the raw cause.',
  };
  return {
    kind: 'failure',
    envelopeId: env.id,
    route: env.route,
    errorCode: code,
    // v2.1 (Phase 4): enriched title/hint from the chat handler's classifier
    title: env._enrichedTitle || titleByCode[code] || 'Route failed',
    body: (env.error && (env.error.message || env.error.detail)) || `Route ${env.route} failed with code ${code}.`,
    hint: env._enrichedHint || hintByCode[code] || 'Check the server logs for the underlying error.',
    provider: env.provider,
    model: env.model,
    timestamp: env.timestamps && env.timestamps.updated,
    sessionId: env.sessionId,
    // v2.1 (Phase 4): show the next-action so the user knows what to do.
    nextAction: env.errorCode === 'rate_limit' ? 'wait 60s, then retry'
              : env.errorCode === 'http_404' ? 'check job id or wait for fresh spawn'
              : env.errorCode === 'timeout'   ? 'switch to a faster lane'
              : env.errorCode === 'auth'      ? 'rotate API key in /providers'
              : 'inspect /api/governor/status',
  };
}

/**
 * Wire format for an SSE frame: `event: <name>\ndata: <json>\n\n`.
 * All chat / research / kernel / mission / swarm routes use this so the
 * chat UI's parser can't drift between routes.
 */
function sseFrame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Build the terminal `done` frame the route MUST emit. The envelope's
 * final state travels in data.state so the chat UI renders the right
 * card without re-deriving it.
 */
function terminalFrame(env) {
  const event = SSE_EVENT_BY_STATUS[env.status] || 'card';
  const data = { envelopeId: env.id, state: env.status, route: env.route, at: env.timestamps && env.timestamps.updated };
  if (env.status === 'failed' || env.status === 'no-output') {
    const card = buildFailureCard(env);
    return sseFrame(event, { ...card, ...data });
  }
  if (env.status === 'answered') {
    return sseFrame('answer', { ...data, content: (env.artifacts && (env.artifacts.reply || env.artifacts.synthesis)) || '', model: env.model, provider: env.provider });
  }
  if (env.status === 'delegated') {
    return sseFrame(event, { ...data, jobId: env.jobId, provider: env.provider });
  }
  return sseFrame('progress', { ...data, message: (env.artifacts && env.artifacts.message) || 'pending' });
}

/**
 * Guard an upstream SSE response. The wrapped stream GUARANTEES a
 * terminal frame on stream end — if the upstream crashes mid-flight
 * or just stops emitting events, we append a `no-output` (or `failed`
 * if we saw an `error` event) terminal frame before closing.
 *
 * Usage:
 *   const wrapped = guardStream(upstream, { route: 'chat', sessionId, ... });
 *   return new Response(wrapped.stream, { headers: wrapped.headers });
 */
function guardStream(upstream, ctx = {}) {
  const enc = new TextEncoder();
  let reader = null; // hoisted so cancel() can release the lock it owns
  let sawDone = false;
  let sawError = false;
  let lastErrorMsg = null;
  let lastErrorData = null;

  const stream = new ReadableStream({
    async start(controller) {
      if (!upstream.body) {
        // Synthesize a failed terminal frame.
        const env = ctx.envelope || null;
        if (env) {
          env.status = 'failed';
          env.timestamps.updated = new Date().toISOString();
          env.errorCode = 'no_body';
          env.error = { message: 'upstream stream has no body' };
        }
        controller.enqueue(enc.encode(env ? terminalFrame(env) : sseFrame('card', { state: 'failed', error: 'no upstream body', ...ctx })));
        try { controller.close(); } catch {}
        return;
      }
      reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      const keepalive = setInterval(() => {
        try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch {}
      }, 15_000);
      // Stall guard: if the upstream provider goes silent (no chunk) for this
      // long, stop waiting and synthesize a visible failure card instead of
      // leaving the chat "thinking forever". (Eddie's no-hang fix.)
      // Chat fails fast (45s); swarm/delegated runs tolerate longer silent gaps
      // between agent steps (120s) before we call it stalled.
      const STALL_MS = (ctx && ctx.route === 'chat') ? 45_000 : 120_000;
      try {
        while (true) {
          const { value, done } = await Promise.race([
            reader.read(),
            new Promise((_, rej) => setTimeout(
              () => rej(new Error(`provider stalled — no response for ${Math.round(STALL_MS / 1000)}s`)),
              STALL_MS,
            )),
          ]);
          if (done) break;
          if (!value) continue;
          controller.enqueue(value);
          buffer += dec.decode(value, { stream: true });
          // Lightweight line-by-line scan for terminal events.
          for (const line of buffer.split(/\r?\n/)) {
            if (line.startsWith('event: done')) sawDone = true;
            else if (line.startsWith('event: answer')) sawDone = true;
            else if (line.startsWith('event: error')) {
              sawError = true;
              const m = line.match(/data: (\{[^\n]*\})/);
              if (m) {
                try { lastErrorData = JSON.parse(m[1]); lastErrorMsg = lastErrorData?.error || lastErrorData?.message; } catch {}
              }
            }
          }
          const lastBreak = buffer.lastIndexOf('\n\n');
          if (lastBreak >= 0) buffer = buffer.slice(lastBreak + 2);
        }
      } catch (e) {
        sawError = true;
        lastErrorMsg = (e && e.message) || String(e);
        // Abort the hung upstream read so the socket frees instead of leaking.
        try { const c = reader.cancel(); if (c && c.catch) c.catch(() => {}); } catch {}
      } finally {
        clearInterval(keepalive);
        try { reader.releaseLock(); } catch {}
      }

      if (!sawDone) {
        // Synthesize the terminal frame the upstream failed to emit.
        const env = ctx.envelope || null;
        if (env) {
          env.status = sawError ? 'failed' : 'no-output';
          env.timestamps.updated = new Date().toISOString();
          if (sawError) {
            env.errorCode = 'stream_error';
            env.error = { message: lastErrorMsg || 'upstream stream error' };
          } else {
            env.errorCode = 'no_output';
            env.error = { message: 'upstream stream ended without terminal event' };
          }
        }
        controller.enqueue(enc.encode(env ? terminalFrame(env) : sseFrame(
          sawError ? 'card' : 'card',
          { state: sawError ? 'failed' : 'no-output', error: lastErrorMsg || 'stream ended without terminal event', ...ctx }
        )));
      }
      try { controller.close(); } catch {}
    },
    cancel() {
      // Cancel via the reader (it owns the lock). Cancelling upstream.body
      // directly while a reader is attached rejects with "ReadableStream is
      // locked" — and that async rejection was unhandled, wedging the route.
      try {
        const target = reader || (upstream.body && upstream.body.cancel ? upstream.body : null);
        const p = target && target.cancel && target.cancel();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    },
  });

  return {
    stream,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  };
}

/**
 * Map an upstream HTTP status code to a terminal status + errorCode.
 * Mirrors the deriveStatus logic in envelope.js so non-streaming routes
 * produce the same shape as the SSE ones.
 */
function classifyHttp(status) {
  if (status >= 200 && status < 300) return null; // caller decides
  if (status === 501 || status === 404) return { status: 'failed', errorCode: 'http_501' };
  if (status === 429) return { status: 'failed', errorCode: 'rate_limit' };
  if (status === 408) return { status: 'failed', errorCode: 'timeout' };
  if (status === 502 || status === 503 || status === 504) return { status: 'failed', errorCode: 'unavailable' };
  if (status >= 500) return { status: 'failed', errorCode: `http_${status}` };
  if (status >= 400) return { status: 'failed', errorCode: `http_${status}` };
  return null;
}

module.exports = { SSE_EVENT_BY_STATUS, buildFailureCard, TERMINAL_STATUSES, sseFrame, terminalFrame, guardStream, classifyHttp };
