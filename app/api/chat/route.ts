import { NextRequest } from 'next/server';
import { checkOperator } from '../_lib/operator-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/chat — SSE streaming passthrough to unified_api :7780.
 *
 * SPINE CONTRACT (2026-06-23, Eddie's fix):
 *   Every user message opens an envelope via lib/spine/envelope. The
 *   SSE stream is wrapped in guardStream (lib/spine/contract) so the
 *   chat UI ALWAYS receives a terminal frame in one of
 *   {answered, delegated, failed, no-output}. No silent exits.
 *
 *   unified_api emits these events:
 *     - envelope  { envelopeId, route, status }
 *     - phase     { phase: 'received' | 'thinking' | 'done' }
 *     - token     { content, model }
 *     - tool-call { tool, args }
 *     - tool-result { tool, ok, content }
 *     - routed    { lane, model, provider, agent, label, fallback, reason }
 *     - job       { job_id, lane, project }
 *     - done      { reply, model, providerStatus, state, envelopeId }
 *     - error     { error }
 *
 *   If upstream is unreachable, we fall through to a local chat-agent
 *   (lib/chat-agent.js) so the UI never hangs. The fallback response
 *   carries `state: 'answered' | 'failed' | 'no_output'`.
 */

const UPSTREAM_URL = 'http://127.0.0.1:7780/api/chat';
const UPSTREAM_TIMEOUT_MS = 60_000;

// Lazy require so a lib/ edit doesn't break the route at import time.
function spine() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/spine/envelope');
}
function contract() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/spine/contract');
}
function traceStore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/trace-store.js');
}
function trace(action: string, status: string, detail: string, extra: Record<string, unknown> = {}) {
  try {
    traceStore().record({ source: 'chat-api', route: '/api/chat', action, status, detail, ...extra });
  } catch {}
}

function jsonResponse(env: any, httpStatus: number, extra: Record<string, unknown> = {}) {
  const body = {
    ok: env.status === 'answered',
    state: env.status,
    envelopeId: env.id,
    sessionId: env.sessionId,
    route: env.route,
    errorCode: env.errorCode,
    error: env.error,
    ...extra,
  };
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  return new Response(
    JSON.stringify({ ok: false, state: 'failed', error: 'method_not_allowed', hint: 'POST { message, history?, model?, provider? }' }),
    { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } }
  );
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, state: 'failed', error: 'invalid_json' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const message = (body?.message ?? body?.prompt ?? '').toString().trim();
  if (!message) {
    trace('chat_rejected', 'error', 'empty message');
    return new Response(
      JSON.stringify({ ok: false, state: 'failed', error: 'empty_message' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Open the message envelope. Every chat request gets one.
  const sessionId = body?.sessionId || req.headers.get('x-purpclaw-session') || null;
  const env = spine().createEnvelope({
    sessionId,
    route: 'chat',
    userText: message,
    source: 'app-api/chat',
  });

  const wantsSSE = (req.headers.get('accept') || '').includes('text/event-stream')
    || body?.stream === true;
  const acceptHeader = wantsSSE ? 'text/event-stream' : 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    trace('chat_upstream_start', 'info', `forwarding to ${UPSTREAM_URL}`, { sessionId, envelopeId: env.id });
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': acceptHeader,
        'X-PurpClaw-Envelope': env.id,
      },
      body: JSON.stringify({ ...body, message, sessionId, envelopeId: env.id }),
      signal: ctrl.signal,
      cache: 'no-store',
    } as any);
    spine().setStatus(env, 'pending', { provider: 'unified_api:7780' });
  } catch (e: any) {
    clearTimeout(timer);
    const reason = e?.message || 'upstream unreachable';
    spine().setStatus(env, 'failed', { errorCode: 'unavailable', error: { message: reason } });
    trace('chat_upstream_fallback', 'error', reason, { sessionId, envelopeId: env.id });
    return await fallbackToLocal(env, body, message, reason);
  }
  clearTimeout(timer);

  if (!upstream.ok && !wantsSSE) {
    // Non-2xx JSON — return the error body as-is, but stamped with state.
    const text = await upstream.text().catch(() => '');
    const cls = contract().classifyHttp(upstream.status) || { status: 'failed', errorCode: `http_${upstream.status}` };
    spine().setStatus(env, cls.status, { errorCode: cls.errorCode, error: { message: text.slice(0, 200) || `upstream HTTP ${upstream.status}` } });
    return jsonResponse(env, upstream.status, { source: 'unified_api:7780', upstreamStatus: upstream.status, body: text });
  }

  if (wantsSSE && !upstream.ok) {
    const text = await upstream.text().catch(() => '');
    const cls = contract().classifyHttp(upstream.status) || { status: 'failed', errorCode: `http_${upstream.status}` };
    spine().setStatus(env, cls.status, { errorCode: cls.errorCode, error: { message: text.slice(0, 200) || `upstream HTTP ${upstream.status}` } });
    trace('chat_upstream_error', 'error', text || `upstream HTTP ${upstream.status}`, { sessionId, envelopeId: env.id, upstreamStatus: upstream.status });
    const c = contract();
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(c.sseFrame('phase', { phase: 'error', status: upstream.status })));
        controller.enqueue(enc.encode(c.sseFrame('error', {
          error: text || `upstream HTTP ${upstream.status}`,
          upstreamStatus: upstream.status,
          source: 'unified_api:7780',
        })));
        // Terminal — guaranteed by the contract.
        controller.enqueue(enc.encode(c.terminalFrame(env)));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: defaultSseHeaders() });
  }

  if (wantsSSE) {
    trace('chat_stream_open', 'ok', 'SSE stream opened', { sessionId, envelopeId: env.id });
    // Pipe upstream SSE through guardStream — guarantees a terminal
    // frame on stream end, even if the upstream crashes mid-flight.
    const wrapped = contract().guardStream(upstream, {
      route: 'chat',
      sessionId,
      envelopeId: env.id,
      envelope: env,        // guardStream will mutate env on no-output / failed
    });
    return new Response(wrapped.stream, { status: 200, headers: defaultSseHeaders() });
  }

  // JSON path (no SSE) — return the parsed body, stamped with state.
  try {
    const data = await upstream.json();
    // unified_api returns the body in its own shape. We classify
    // success by `data.ok` and adopt the upstream state if it set one.
    const upstreamState = data?.state || (data?.ok !== false ? 'answered' : 'failed');
    const reply = data?.reply || data?.data?.reply || data?.content || '';
    spine().setStatus(env, upstreamState, {
      provider: data?.provider || 'unified_api:7780',
      model: data?.model,
      artifacts: { reply },
      errorCode: upstreamState === 'failed' ? 'http_unknown' : null,
    });
    trace('chat_json_done', 'ok', upstreamState, { sessionId, envelopeId: env.id });
    return jsonResponse(env, upstreamState === 'failed' ? 502 : 200, { source: 'unified_api:7780', ...data });
  } catch (e: any) {
    spine().setStatus(env, 'failed', { errorCode: 'unavailable', error: { message: `upstream parse error: ${e?.message}` } });
    return jsonResponse(env, 502, { error: 'upstream_parse_error', detail: e?.message });
  }
}

function defaultSseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

async function fallbackToLocal(env: any, body: any, message: string, reason: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chatWithTools } = await import('../../../lib/chat-agent');
    // History injection — same as unified_api.js, so the local fallback
    // rehydrates the session too.
    const sessionId = env.sessionId;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let history: any[] = [];
    if (sessionId) {
      try {
        const { getHistory } = require('../../../lib/spine/session-store');
        history = getHistory(sessionId) || [];
      } catch {}
    }
    if (!Array.isArray(body?.history)) body.history = [];
    spine().setStatus(env, 'pending', { provider: 'local:chat-agent' });
    const result = await chatWithTools(
      [
        ...history,
        ...body.history,
        { role: 'user' as const, content: message },
      ],
      {
        model: body?.model,
        provider: body?.provider,
        cwd: process.cwd(),
        maxTurns: 4,
      }
    );
    const content = result?.content ?? '';
    if (content && content.length > 0) {
      spine().setStatus(env, 'answered', { artifacts: { reply: content } });
    } else {
      spine().setStatus(env, 'no-output', { errorCode: 'no_output', error: { message: 'local fallback returned empty' } });
    }
    return jsonResponse(env, content ? 200 : 502, {
      source: 'local:chat-agent',
      fallback_reason: reason,
      content,
      messages: Array.isArray(result?.messages) ? result.messages.length : 0,
    });
  } catch (e: any) {
    spine().setStatus(env, 'failed', { errorCode: 'chat_failure', error: { message: e?.message || String(e) } });
    return jsonResponse(env, 503, {
      source: 'local:chat-agent',
      fallback_reason: reason,
      error: e?.message || String(e),
    });
  }
}
