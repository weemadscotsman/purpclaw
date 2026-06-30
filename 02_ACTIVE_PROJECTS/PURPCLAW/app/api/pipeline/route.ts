import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// UI truth = backend truth. Proxies the unified pipeline spine (:7780) so the
// cockpit shows the live health board (green/amber/red/purple) + jobs.
// GET /api/pipeline           → { health, jobs }
// GET /api/pipeline?view=jobs → jobs only (forwards project/lane/status filters)

const UPSTREAM = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search || '';
  try {
    if (req.nextUrl.searchParams.get('view') === 'jobs') {
      const r = await fetch(`${UPSTREAM}/api/pipeline/jobs${qs}`, { cache: 'no-store' });
      return new NextResponse(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const [h, j] = await Promise.all([
      fetch(`${UPSTREAM}/api/pipeline/health`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(`${UPSTREAM}/api/pipeline/jobs${qs}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]);
    return NextResponse.json({ health: h, jobs: (j && j.jobs) || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'pipeline spine unreachable', detail: e?.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  // Stop control passthrough: { action:'stop'|'start', ... } → :7780/api/pipeline/*
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'start' ? 'start' : 'stop';
    const r = await fetch(`${UPSTREAM}/api/pipeline/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return new NextResponse(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'pipeline spine unreachable', detail: e?.message }, { status: 502 });
  }
}
