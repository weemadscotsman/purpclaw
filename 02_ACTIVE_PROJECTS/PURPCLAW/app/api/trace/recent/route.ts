import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const trace = require('../../../../lib/trace-store.js');
  const limit = Number(req.nextUrl.searchParams.get('limit') || 200);
  return NextResponse.json({ ok: true, events: trace.recent(limit) });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const trace = require('../../../../lib/trace-store.js');
  const event = trace.record(body || {});
  return NextResponse.json({ ok: true, event });
}
