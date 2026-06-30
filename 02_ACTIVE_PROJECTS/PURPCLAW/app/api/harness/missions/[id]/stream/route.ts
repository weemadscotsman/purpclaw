import { NextRequest } from 'next/server';
import { HARNESS_BASE } from '../../../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sseError(message: string) {
  const body = [
    `event: error`,
    `data: ${JSON.stringify({ type: 'error', source: 'harness', message, timestamp: new Date().toISOString() })}`,
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return sseError('mission id required');
  try {
    const upstream = await fetch(`${HARNESS_BASE}/harness/jobs/${encodeURIComponent(id)}/stream`, {
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
  } catch (e: any) {
    return sseError(e?.message || 'harness stream unavailable');
  }
}
