import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPSTREAM = 'http://127.0.0.1:7790/tower/stream';

function sseError(message: string, source = 'tower:7790') {
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
    return new Response(upstream.body, {
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
