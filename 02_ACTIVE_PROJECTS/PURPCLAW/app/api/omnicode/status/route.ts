import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bridge = require('../../../../lib/omnicode-bridge.js');
    return NextResponse.json(bridge.getBridgeStatus({ rootDir: process.cwd() }));
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
