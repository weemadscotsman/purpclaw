import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxies the Output Vault (:7780/api/output/list) — durable artifacts linked to
// jobs. Forwards filters: project/lane/type/status/job_id/limit.
// POST { action:'approve'|'archive'|'register', ... } → vault mutation.
const UPSTREAM = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';

export async function GET(req: NextRequest) {
  try {
    const r = await fetch(`${UPSTREAM}/api/output/list${req.nextUrl.search || ''}`, { cache: 'no-store' });
    return new NextResponse(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'output vault unreachable', detail: e?.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = ['approve', 'archive', 'register'].includes(body.action) ? body.action : 'register';
    const r = await fetch(`${UPSTREAM}/api/output/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return new NextResponse(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'output vault unreachable', detail: e?.message }, { status: 502 });
  }
}
