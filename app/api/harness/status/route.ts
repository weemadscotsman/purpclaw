import { NextResponse } from 'next/server';
import { harnessFetch, HARNESS_PORT } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await harnessFetch('/health');
    if (!r.ok) {
      return NextResponse.json(
        { status: 'offline', port: HARNESS_PORT, upstreamStatus: r.status },
        { status: 503 }
      );
    }
    const data = await r.json();
    return NextResponse.json({
      status: 'online',
      port: HARNESS_PORT,
      service: data.service || 'purpclaw-harness',
      active: data.activeMissions ?? data.active ?? 0,
      archived: Math.max(0, (data.missionCount ?? 0) - (data.activeMissions ?? 0)),
      missions: data.missions || [],
      uptimeSec: data.uptimeSec ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        status: 'offline',
        port: HARNESS_PORT,
        error: e?.name === 'TimeoutError' ? 'timeout' : 'offline-or-not-started',
        hint: 'Start with: purpclaw safe-start harness',
      },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
