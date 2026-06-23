import { NextRequest, NextResponse } from 'next/server';
import { harnessFetch, toMission, type HarnessJob } from '../../_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/harness/missions/:id
 * → Maps to harness_service /harness/jobs/:id
 * → Returns mission shape (UI contract).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'mission-id-required' }, { status: 400 });
  }

  try {
    const r = await harnessFetch(`/harness/jobs/${encodeURIComponent(id)}`);
    if (r.status === 404) {
      return NextResponse.json({ error: 'mission-not-found', missionId: id }, { status: 404 });
    }
    if (!r.ok) {
      return NextResponse.json(
        { error: 'harness-service-error', upstreamStatus: r.status },
        { status: 502 }
      );
    }
    const payload = await r.json();
    const job: HarnessJob = (payload.mission || payload) as HarnessJob;
    const mission = toMission(job);
    if (!mission) {
      return NextResponse.json({ error: 'invalid-job-payload', raw: job }, { status: 500 });
    }
    return NextResponse.json(mission);
  } catch (e: any) {
    return NextResponse.json(
      {
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
