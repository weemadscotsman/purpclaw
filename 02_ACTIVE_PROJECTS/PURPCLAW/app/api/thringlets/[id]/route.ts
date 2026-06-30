import { NextRequest, NextResponse } from 'next/server';
import { bridgeFetch, offlineResponse } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/thringlets/:id
 * Detail view — pulls thringlet + the observer's recent dispatches that hit it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id-required' }, { status: 400 });

  let thringlet: any = null;
  let recent: any[] = [];

  try {
    const r = await bridgeFetch(`/thringlets/${encodeURIComponent(id)}`);
    if (r.status === 404) return NextResponse.json({ error: 'thringlet-not-found', id }, { status: 404 });
    if (r.ok) thringlet = await r.json();
  } catch {
    return NextResponse.json(
      offlineResponse('purpclaw-thringlet-bridge', 'start: purpclaw safe-start thringlet-bridge'),
      { status: 503 }
    );
  }

  if (!thringlet) return NextResponse.json({ error: 'thringlet-not-found', id }, { status: 404 });

  try {
    const r = await bridgeFetch('/thringlets/last-events?limit=120');
    if (r.ok) {
      const data = await r.json();
      recent = (data.events || []).filter((e: any) => e.deliveredTo === id).slice(-30);
    }
  } catch {}

  return NextResponse.json({ thringlet, recent });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
