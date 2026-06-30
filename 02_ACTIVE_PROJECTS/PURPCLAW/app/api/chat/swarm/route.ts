import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/chat/swarm — SSE streaming passthrough to unified_api :7780.
 *
 * SPINE CONTRACT (2026-06-23, Eddie's fix):
 *   The megapanel (Quill / CommandPanel) posts here. unified_api's
 *   /api/chat/swarm fans out to N agents in parallel. We pipe
 *   through guardStream so the chat UI ALWAYS sees a terminal
 *   frame (no silent exits, no missing progress cards).
 */

const UPSTREAM_URL = 'http://127.0.0.1:7780/api/chat/swarm';
const UPSTREAM_TIMEOUT_MS = 300_000;

function spine() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/spine/envelope');
}
function contract() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/spine/contract');
}

export async function GET() {
  return new Response(
    JSON.stringify({ ok: false, state: 'failed', error: 'method_not_allowed', hint: 'POST { message, agents? }' }),
    { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } }
  );
}

export async function POST(req: NextRequest) {
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
    return new Response(
      JSON.stringify({ ok: false, state: 'failed', error: 'empty_message' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessionId = body?.sessionId || req.headers.get('x-purpclaw-session') || null;
  const env = spine().createEnvelope({
    sessionId,
    route: 'swarm',
    userText: message,
    source: 'app-api/chat/swarm',
  });
  spine().setStatus(env, 'pending', { provider: 'unified_api:7780', model: 'swarm' });

  const wantsSSE = (req.headers.get('accept') || '').includes('text/event-stream')
    || body?.stream === true;

  // JSON path — call and wait, return a stamped terminal response.
  if (!wantsSSE) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const r = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PurpClaw-Envelope': env.id },
        body: JSON.stringify({ ...body, sessionId, envelopeId: env.id }),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      const text = await r.text();
      const cls = contract().classifyHttp(r.status) || { status: 'answered', errorCode: null };
      const upstreamState = cls.status || 'answered';
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      spine().setStatus(env, upstreamState, {
        provider: 'unified_api:7780',
        errorCode: cls.errorCode,
        error: cls.errorCode ? { message: text.slice(0, 200) } : undefined,
        artifacts: parsed ? { synthesis: parsed.synthesis, agents: parsed.agents } : null,
      });
      return new Response(
        JSON.stringify({
          ok: env.status === 'answered',
          state: env.status,
          envelopeId: env.id,
          errorCode: env.errorCode,
          error: env.error,
          source: 'unified_api:7780',
          body: text,
        }),
        { status: r.status, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (e: any) {
      spine().setStatus(env, 'failed', { errorCode: 'unavailable', error: { message: `upstream unreachable: ${e?.message}` } });
      return new Response(
        JSON.stringify({ ok: false, state: 'failed', errorCode: 'unavailable', error: { message: e?.message }, envelopeId: env.id }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // SSE passthrough.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-PurpClaw-Envelope': env.id,
      },
      body: JSON.stringify({ ...body, sessionId, envelopeId: env.id }),
      signal: ctrl.signal,
      cache: 'no-store',
    } as any);
  } catch (e: any) {
    clearTimeout(timer);
    spine().setStatus(env, 'failed', { errorCode: 'unavailable', error: { message: `upstream unreachable: ${e?.message}` } });
    const c = contract();
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(c.sseFrame('error', { error: 'upstream_unreachable', detail: e?.message })));
        controller.enqueue(enc.encode(c.terminalFrame(env)));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: sseHeaders() });
  }
  clearTimeout(timer);

  if (!upstream.body) {
    spine().setStatus(env, 'failed', { errorCode: 'no_body', error: { message: 'upstream has no body' } });
    return new Response(
      JSON.stringify({ ok: false, state: 'failed', errorCode: 'no_body', envelopeId: env.id }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const wrapped = contract().guardStream(upstream, {
    route: 'swarm',
    sessionId,
    envelopeId: env.id,
    envelope: env,
  });
  return new Response(wrapped.stream, { status: 200, headers: sseHeaders() });
}

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
