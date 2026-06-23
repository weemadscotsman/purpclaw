import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/chat — SSE streaming passthrough to unified_api :7780.
 *
 * The megapanel and AgentTower post here. We forward the body to
 * unified_api's `/api/chat` with `Accept: text/event-stream` and pipe
 * the response back unchanged. unified_api emits these events:
 *   - phase       { phase: 'received' | 'thinking' | 'done' }
 *   - token       { content, model }
 *   - tool-call   { tool, args }
 *   - tool-result { tool, ok, content }
 *   - done        { reply, model, providerStatus, toolCalls, source }
 *   - error       { error }
 *
 * If upstream is unreachable, we fall through to a local chat-agent
 * (lib/chat-agent.js) so the UI never hangs.
 */

const UPSTREAM_URL = 'http://127.0.0.1:7780/api/chat';
const UPSTREAM_TIMEOUT_MS = 60_000;

function sseFrame(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseErrorText(text: string) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.error || parsed?.message || text;
  } catch {
    return text;
  }
}

function trace(action: string, status: string, detail: string, extra: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../lib/trace-store.js').record({ source: 'chat-api', route: '/api/chat', action, status, detail, ...extra });
  } catch {}
}

export async function GET() {
  return new Response(
    JSON.stringify({ ok: false, error: 'method_not_allowed', hint: 'POST { message, history?, model?, provider? }' }),
    { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } }
  );
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_json', status: 'client_error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const message = (body?.message ?? body?.prompt ?? '').toString().trim();
  if (!message) {
    trace('chat_rejected', 'error', 'empty message');
    return new Response(
      JSON.stringify({ ok: false, error: 'empty_message', status: 'client_error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Always pass the caller's Accept header through (or default to SSE).
  const wantsSSE = (req.headers.get('accept') || '').includes('text/event-stream')
    || body?.stream === true;
  const acceptHeader = wantsSSE ? 'text/event-stream' : 'application/json';

  // Open upstream request. If SSE: pipe the response body through.
  // If JSON: parse and return a single Response.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    trace('chat_upstream_start', 'info', `forwarding to ${UPSTREAM_URL}`, { sessionId: body?.sessionId || '' });
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': acceptHeader,
      },
      body: JSON.stringify({ ...body, message }),
      signal: ctrl.signal,
      // Disable Next's automatic buffering for the streamed case
      cache: 'no-store',
    } as any);
  } catch (e: any) {
    clearTimeout(timer);
    trace('chat_upstream_fallback', 'error', e?.message || 'upstream unreachable', { sessionId: body?.sessionId || '' });
    return await fallbackToLocal(body, message, e?.message || 'upstream unreachable');
  }
  clearTimeout(timer);

  if (!upstream.ok && !wantsSSE) {
    // Non-2xx JSON — return the error body as-is.
    const text = await upstream.text().catch(() => '');
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (wantsSSE && !upstream.ok) {
    const text = await upstream.text().catch(() => '');
    const message = parseErrorText(text) || `upstream HTTP ${upstream.status}`;
    trace('chat_upstream_error', 'error', message, { upstreamStatus: upstream.status, sessionId: body?.sessionId || '' });
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(sseFrame('phase', { phase: 'error', status: upstream.status })));
        controller.enqueue(enc.encode(sseFrame('error', {
          error: message,
          upstreamStatus: upstream.status,
          source: 'unified_api:7780',
        })));
        controller.enqueue(enc.encode(sseFrame('done', {
          reply: '',
          providerStatus: 'error',
          upstreamStatus: upstream.status,
          source: 'unified_api:7780',
        })));
        controller.close();
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

  if (wantsSSE) {
    trace('chat_stream_open', 'ok', 'SSE stream opened', { sessionId: body?.sessionId || '' });
    // Pass-through SSE. Two readers — one on upstream, one to the client.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          // Tiny keepalive comment every 15s so proxies / Next don't close
          // the connection on idle LLM calls.
          const keepalive = setInterval(() => {
            try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)); } catch {}
          }, 15_000);
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          } finally {
            clearInterval(keepalive);
            try { controller.close(); } catch {}
          }
        } catch (e: any) {
          try { controller.error(e); } catch {}
        } finally {
          try { reader.releaseLock(); } catch {}
        }
      },
      cancel() {
        // Client disconnected — abort upstream so we don't waste tokens.
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

  // JSON path (no SSE) — return the parsed body.
  try {
    const data = await upstream.json();
    trace('chat_json_done', 'ok', data?.providerStatus || 'json response', { sessionId: body?.sessionId || '' });
    return Response.json({ ok: true, source: 'unified_api:7780', ...data });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'upstream_parse_error', detail: e?.message },
      { status: 502 }
    );
  }
}

async function fallbackToLocal(body: any, message: string, reason: string) {
  try {
    const { chatWithTools } = await import('../../../lib/chat-agent');
    const history = Array.isArray(body?.history) ? body.history : [];
    const result = await chatWithTools(
      [...history, { role: 'user' as const, content: message }],
      {
        model: body?.model,
        provider: body?.provider,
        cwd: process.cwd(),
        maxTurns: 4,
      }
    );
    return Response.json({
      ok: true,
      source: 'local:chat-agent',
      fallback_reason: reason,
      content: result?.content ?? '',
      messages: Array.isArray(result?.messages) ? result.messages.length : 0,
    });
  } catch (e: any) {
    return Response.json(
      {
        ok: false,
        status: 'down',
        reason: 'chat_failure',
        upstream: 'lib/chat-agent.js',
        fallback_reason: reason,
        error: e?.message || String(e),
      },
      { status: 503 }
    );
  }
}
