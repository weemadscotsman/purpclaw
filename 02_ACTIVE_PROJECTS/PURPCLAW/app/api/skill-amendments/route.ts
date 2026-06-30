import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:7791/api/propose-amendments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minFailureCount: 2 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ error: 'Gatekeeper unreachable' }, { status: 503 });

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : data.amendments ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
