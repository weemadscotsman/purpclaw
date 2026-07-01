import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/health — canonical health on the web port.
 *
 * The real health probe lives on unified_api (:7780). Callers hitting the
 * relative /api/health on nextjs (:3030) got 404. This proxy surfaces it on the
 * web port, with a clear degraded payload if the api process is down.
 */
const UPSTREAM = 'http://127.0.0.1:7780/api/health';

export async function GET() {
  try {
    const r = await fetch(UPSTREAM, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const body = await r.text();
    return new NextResponse(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return NextResponse.json(
      { status: 'degraded', web: 'ok', api: 'unreachable', error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
