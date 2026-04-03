import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:7791/health', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return NextResponse.json({ error: 'Gatekeeper unreachable' }, { status: 503 });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amendmentId, action } = body;

    const res = await fetch('http://127.0.0.1:7791/api/amend-patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amendmentId, action }),
    });

    if (!res.ok) return NextResponse.json({ error: 'Amend failed' }, { status: 400 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
