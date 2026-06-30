import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v2.1 — Proxies the pulse heartbeat from unified_api :7780.
// The UI calls this to read the stack's self-waking heartbeat:
//   - GET          current status + last 5 findings
//   - GET ?limit=N override for notifications
// The fallback is for when unified_api is unreachable.

const UPSTREAM = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';

async function proxy(path: string, init?: RequestInit) {
  try {
    const r = await fetch(UPSTREAM + path, { ...init, cache: 'no-store' });
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

export async function GET(request: NextRequest) {
  // /api/pulse           →  /api/pulse (status)
  // /api/pulse?path=...  →  /api/pulse/notifications?limit=N
  // Forward the search string to the upstream so the UI can pass limits through.
  const limit = request.nextUrl.searchParams.get('limit');
  const q = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return proxy(`/api/pulse/notifications${q}`);
}

export async function POST() {
  // Manual tick trigger
  return proxy('/api/pulse/tick', { method: 'POST' });
}