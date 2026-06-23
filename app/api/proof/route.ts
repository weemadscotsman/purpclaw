import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxies the Proof Ledger (:7780/api/proof) — evidence rows + truth stats
// (incl. fakeGreens). Forwards filters: project/taskId/agent/status/risk/limit.
const UPSTREAM = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';

export async function GET(req: NextRequest) {
  try {
    const r = await fetch(`${UPSTREAM}/api/proof${req.nextUrl.search || ''}`, { cache: 'no-store' });
    return new NextResponse(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'proof ledger unreachable', detail: e?.message }, { status: 502 });
  }
}
