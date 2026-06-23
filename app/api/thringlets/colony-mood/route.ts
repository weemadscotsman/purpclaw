import { NextResponse } from 'next/server';
import { bridgeFetch, localColonyMood, offlineResponse } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/thringlets/colony-mood
 * Cheap mood probe — just hits the bridge. Used by header dots / Mochi widget.
 */
export async function GET() {
  try {
    const r = await bridgeFetch('/thringlets/colony-mood');
    if (r.ok) return NextResponse.json(await r.json());
    return NextResponse.json({
      ...localColonyMood(),
      bridge: offlineResponse('thringlet-bridge', 'optional bridge offline; serving persisted local companion state'),
      upstreamStatus: r.status,
    });
  } catch (e: any) {
    return NextResponse.json({
      ...localColonyMood(),
      bridge: offlineResponse('thringlet-bridge', 'optional bridge offline; serving persisted local companion state'),
      bridgeError: e?.name === 'TimeoutError' ? 'timeout' : 'offline',
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
