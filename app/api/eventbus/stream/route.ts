import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function eventBusUrl(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic') || '*';
  const safeTopic = topic.replace(/^\/+/, '').replace(/\.\./g, '');
  return `http://127.0.0.1:7782/events/${safeTopic || '*'}`;
}

function sseError(message: string, source = 'eventbus:7782') {
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

export async function GET(req: NextRequest) {
  const upstreamUrl = eventBusUrl(req);
  try {
    const upstream = await fetch(upstreamUrl, {
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

export async function HEAD(req: NextRequest) {
  return NextResponse.json({ ok: true, upstream: eventBusUrl(req) });
}
