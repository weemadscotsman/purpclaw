import { NextResponse } from 'next/server';
import { fetchGovernorStatus } from '../../_lib/governor-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/governor/status
 * Thin proxy to the API server (7780) where the Usage Governor lives in-process.
 * Returns the same JSON shape the internal endpoint produces.
 */
export async function GET() {
  try {
    const data = await fetchGovernorStatus();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
