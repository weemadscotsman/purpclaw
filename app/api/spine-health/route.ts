import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v2.1 — Proxies the spine-shim health from unified_api :7780.
// The shim returns the cognitive spine's archive file metadata when the
// Python ThreadingTCPServer is deadlocked.

const UPSTREAM = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';

export async function GET() {
  try {
    const r = await fetch(UPSTREAM + '/api/spine/health', { cache: 'no-store' });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: {
        'Content-Type': r.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'unified_api unreachable', detail: e?.message },
      { status: 502 }
    );
  }
}