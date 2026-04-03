import { NextRequest, NextResponse } from 'next/server';
import { harnessFetch } from '../../../_shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/harness/missions/:id/abort
 * → Maps to harness_service /harness/jobs/:id/stop
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'mission-id-required' }, { status: 400 });
  }

  try {
    const r = await harnessFetch(`/api/harness/missions/${encodeURIComponent(id)}/abort`, { method: 'POST', body: '{}' });
    if (r.status === 404) {
      return NextResponse.json({ ok: false, error: 'mission-not-active', missionId: id }, { status: 404 });
    }
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { ok: false, error: 'harness-service-error', upstreamStatus: r.status, detail: text.slice(0, 400) },
        { status: 502 }
      );
    }
    const result = await r.json();
    return NextResponse.json({ ok: true, missionId: id, ...result });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.name === 'TimeoutError' ? 'timeout' : 'harness-service-offline',
        missionId: id,
      },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
