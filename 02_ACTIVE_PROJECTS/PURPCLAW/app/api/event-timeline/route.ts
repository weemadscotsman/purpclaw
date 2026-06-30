import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const topics = (searchParams.get('topics') || 'agent,swarm,tool,orchestrator').split(',');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  try {
    const res = await fetch('http://127.0.0.1:7782/state', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return NextResponse.json({ error: 'EventBus unreachable' }, { status: 503 });

    const data = await res.json();
    const events = (data.recentEvents || [])
      .filter((e: any) => topics.some(t => (e.topic || '').includes(t)))
      .slice(-limit)
      .map((e: any) => ({
        id: e.id || `${e.ts}`,
        ts: e.ts,
        topic: e.topic,
        type: e.type,
        agentId: e.agentId,
        agentName: e.agentName,
        message: e.message,
        data: e,
      }));

    return NextResponse.json({ events, total: events.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
