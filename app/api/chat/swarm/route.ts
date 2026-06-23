import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/chat/swarm — SSE streaming passthrough to unified_api :7780.
 *
 * The megapanel (Quill / CommandPanel) posts here. unified_api's
 * `/api/chat/swarm` fans out to N agents in parallel and emits a
 * stream of phase / per-agent / synthesis events. We pipe them
 * straight back so the UI sees live progress.
 *
 * If the upstream is down, we emit an `error` event and close.
 */

const UPSTREAM_URL = 'http://127.0.0.1:7780/api/chat/swarm';
// Long swarm missions stream for minutes; a 60s cap aborted them mid-flight.
const UPSTREAM_TIMEOUT_MS = 300_000;

export async function GET() {
  return new Response(
    JSON.stringify({ ok: false, error: 'method_not_allowed', hint: 'POST { message, agents? }' }),
    { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } }
  );
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_json' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const message = (body?.message ?? body?.prompt ?? '').toString().trim();
  if (!message) {
    return new Response(
      JSON.stringify({ ok: false, error: 'empty_message' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const wantsSSE = (req.headers.get('accept') || '').includes('text/event-stream')
    || body?.stream === true;

  // If JSON, just call and wait.
  if (!wantsSSE) {
    try {
      const r = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      return Response.json(
        { ok: false, error: 'upstream_unreachable', detail: e?.message },
        { status: 502 }
      );
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
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    } as any);
  } catch (e: any) {
    clearTimeout(timer);
    // Synthesize a single error event then close.
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `event: error\ndata: ${JSON.stringify({ error: 'upstream_unreachable', detail: e?.message })}\n\n`
        ));
        controller.enqueue(new TextEncoder().encode(
          `event: done\ndata: ${JSON.stringify({ reply: '', model: '', source: 'swarm-failed' })}\n\n`
        ));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }
  clearTimeout(timer);

  if (!upstream.body) {
    return Response.json(
      { ok: false, error: 'upstream_no_body' },
      { status: 502 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const keepalive = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)); } catch {}
      }, 15_000);
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch (e: any) {
        try {
          controller.enqueue(new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({ error: 'stream_lost', detail: e?.message })}\n\n`
          ));
        } catch {}
      } finally {
        clearInterval(keepalive);
        try { controller.close(); } catch {}
        try { reader.releaseLock(); } catch {}
      }
    },
    cancel() {
      try { ctrl.abort(); } catch {}
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
