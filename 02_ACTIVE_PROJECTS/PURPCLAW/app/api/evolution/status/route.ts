import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/evolution/status — proxy to unified_api (:7780).
 *
 * The self-evolution loop status + controls live in the api process (:7780).
 * The /evolution page (and the MissionControl evolution lens) fetch this as a
 * relative path, which hit nextjs (:3030) and 404'd. This proxy mounts the
 * canonical path on the web port. GET = status, POST = action (run-once/pause/resume).
 */
const UPSTREAM = 'http://127.0.0.1:7780/api/evolution/status';

export async function GET() {
  try {
    const r = await fetch(UPSTREAM, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = await r.text();
    return new NextResponse(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, enabled: false, error: e instanceof Error ? e.message : String(e), hint: 'unified_api (:7780) unreachable' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  let body = '{}';
  try { body = await req.text(); } catch { /* empty body ok */ }
  try {
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const out = await r.text();
    return new NextResponse(out, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), hint: 'unified_api (:7780) unreachable' }, { status: 200 });
  }
}
