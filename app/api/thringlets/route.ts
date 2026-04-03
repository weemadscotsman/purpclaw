import { NextResponse } from 'next/server';
import { bridgeFetch, localColonyMood, localMochiThringlet, offlineResponse } from './_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/thringlets
 * Aggregates: full colony, mood, bridge health — all from the native bridge :7799.
 */
export async function GET() {
  let thringlets: unknown[] = [];
  let mood: any = null;
  let bridge: any = null;
  let count = 0;

  try {
    const r = await bridgeFetch('/thringlets');
    if (r.ok) {
      const data = await r.json();
      thringlets = Array.isArray(data?.thringlets) ? data.thringlets : [];
      count = data?.count ?? thringlets.length;
    }
  } catch { /* bridge offline */ }

  try {
    const r = await bridgeFetch('/thringlets/colony-mood');
    if (r.ok) mood = await r.json();
  } catch {}

  try {
    const r = await bridgeFetch('/health');
    if (r.ok) bridge = await r.json();
  } catch {}

  if (!bridge) {
    const local = localMochiThringlet();
    return NextResponse.json({
      status: local ? 'local' : 'offline',
      count: local ? 1 : 0,
      thringlets: local ? [local] : [],
      mood: localColonyMood(),
      bridge: offlineResponse('purpclaw-thringlet-bridge', 'optional bridge offline; serving persisted local companion state'),
    });
  }

  return NextResponse.json({
    status: 'online',
    count,
    thringlets,
    mood,
    bridge: { online: true, service: bridge.service, port: bridge.port, snapshot: bridge },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
