import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// N4 fix: INTERNAL_API_KEY was defined in .env but never validated anywhere.
// This route gives it a purpose: service-to-service authentication between
// PURPCLAW backends. Caller presents the key in `authorization: Bearer <key>`
// or `x-internal-key: <key>`. Returns 401 if missing/mismatched, 200 with
// the caller's identity (loopback / 127.0.0.1 / external IP) if valid.
//
// Use from another PURPCLAW service:
//   const r = await fetch('http://127.0.0.1:3030/api/internal/check', {
//     headers: { 'authorization': `Bearer ${process.env.INTERNAL_API_KEY}` }
//   });
//   if (!r.ok) throw new Error('not on the trusted ring');

function callerIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'loopback';
}

function presentedKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer || req.headers.get('x-internal-key') || null;
}

export async function GET(req: NextRequest) {
  const want = process.env.INTERNAL_API_KEY;
  if (!want) {
    return NextResponse.json({
      ok: false,
      error: 'INTERNAL_API_KEY not configured on server',
      hint: 'Set INTERNAL_API_KEY in .env to enable service-to-service auth',
    }, { status: 503 });
  }
  const got = presentedKey(req);
  if (!got || got !== want) {
    return NextResponse.json({
      ok: false,
      error: 'internal api key required',
      acceptedMethods: ['authorization: Bearer <key>', 'x-internal-key: <key>'],
    }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    caller: callerIp(req),
    authed: 'INTERNAL_API_KEY',
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
