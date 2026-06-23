import { NextResponse } from 'next/server';
import { harnessFetch, toMission, type HarnessJob } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const r = await harnessFetch('/harness/jobs');
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: 'harness-service-error', upstreamStatus: r.status }, { status: 502 });
    }
    const data = await r.json();
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return NextResponse.json({
      ok: true,
      jobs,
      missions: jobs.map((job: HarnessJob) => toMission(job)).filter(Boolean),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.name === 'TimeoutError' ? 'timeout' : 'harness-service-offline' },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
