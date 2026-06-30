import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPSTREAM = 'http://127.0.0.1:7780/api/stream';

function sseError(message: string, source = 'unified_api:7780') {
  const body = [
    `event: error`,
    `data: ${JSON.stringify({ type: 'error', source, message, timestamp: new Date().toISOString() })}`,
    '',
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { Accept: 'text/event-stream' },
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) {
      return sseError(`upstream stream unavailable: HTTP ${upstream.status}`);
    }
    let chunkIndex = 0;
    const retainedStream = upstream.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        try {
          const text = new TextDecoder().decode(chunk);
          if (text.trim()) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../../../../lib/memory-retention.js').remember('service_log_chunk', text, {
              key: `logs-stream:${Date.now()}:${chunkIndex++}`,
              source: 'logs-stream',
              type: 'service_log',
              importance: text.toLowerCase().includes('error') ? 0.75 : 0.35,
              valence: text.toLowerCase().includes('error') ? -0.4 : 0,
              metadata: { route: '/api/logs/stream', upstream: UPSTREAM, chunkIndex },
            });
          }
        } catch {}
      },
    }));
    return new Response(retainedStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    return sseError(error?.message || 'upstream stream unavailable');
  }
}

export async function HEAD() {
  return NextResponse.json({ ok: true, upstream: UPSTREAM });
}
