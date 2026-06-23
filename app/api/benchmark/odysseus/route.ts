import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scorecard = require('../../../../lib/odysseus-scorecard.js');
    return NextResponse.json({ ok: true, ...scorecard.getScorecard() });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
