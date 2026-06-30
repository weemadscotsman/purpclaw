import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function catalog() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/surface-capabilities.js');
}

export async function GET() {
  try {
    return NextResponse.json(catalog().paritySummary(), {
      headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
