import { NextRequest, NextResponse } from 'next/server';
import { bridgeFetch, offlineResponse } from '../../_shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/thringlets/:id/interact
 * Body: { kind: "stimulate"|"calm"|"challenge"|"reward"|"talk"|"feed"|"train"|"purge"|"reset"|"neglect"|"inject",
 *         reason?: string, weight?: number }
 */
const VALID_KINDS = new Set([
  'stimulate', 'calm', 'challenge', 'reward',
  'talk', 'feed', 'train', 'purge', 'reset', 'neglect', 'inject'
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id-required' }, { status: 400 });

  let body: any = {};
  try { body = await request.json(); } catch {}

  const kind = String(body?.kind || '').toLowerCase();
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json(
      { error: 'kind-required', allowed: Array.from(VALID_KINDS) },
      { status: 400 }
    );
  }

  const operatorCookie = request.cookies.get('purpclaw_operator')?.value;
  const operatorName = operatorCookie || 'operator';

  try {
    const r = await bridgeFetch(`/thringlets/${encodeURIComponent(id)}/interact`, {
      method: 'POST',
      body: JSON.stringify({
        kind,
        reason: body?.reason || 'manual UI interaction',
        weight: Number(body?.weight) || 1,
        source: operatorName,
      }),
    });
    if (r.status === 404) {
      return NextResponse.json({ error: 'thringlet-not-found', id }, { status: 404 });
    }
    if (!r.ok) {
      const detail = await r.text();
      return NextResponse.json({ error: 'bridge-rejected', upstreamStatus: r.status, detail: detail.slice(0, 400) }, { status: 502 });
    }
    return NextResponse.json(await r.json());
  } catch (e: any) {
    return NextResponse.json(
      { ...offlineResponse('purpclaw-thringlet-bridge', 'start: purpclaw safe-start thringlet-bridge'),
        error: e?.name === 'TimeoutError' ? 'timeout' : 'offline' },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
