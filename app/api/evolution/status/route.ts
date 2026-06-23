import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const evolution = require('../../../../lib/self-evolution-loop.js');
    return NextResponse.json({ ok: true, ...evolution.getStatus() });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const evolution = require('../../../../lib/self-evolution-loop.js');
    let result: any = null;
    if (action === 'run-once' || action === 'tick') {
      result = await evolution.runTick();
    } else if (action === 'pause' || action === 'stop' || action === 'disable') {
      evolution.stop();
      result = { stopped: true, note: 'Stopped the loop timer in this runtime. Persist EVOLUTION_DISABLED=1 to keep it disabled across restarts.' };
    } else if (action === 'resume' || action === 'start' || action === 'enable') {
      evolution.start();
      result = { started: true, note: 'Started the loop timer in this runtime. Persist EVOLUTION_DISABLED=0 to keep it enabled across restarts.' };
    } else {
      return NextResponse.json({ ok: false, error: 'unknown_action', actions: ['run-once', 'pause', 'resume'] }, { status: 400 });
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../../../lib/trace-store.js').record({
        source: 'evolution-api',
        route: '/api/evolution/status',
        action: `evolution_${action}`,
        status: 'ok',
        detail: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 400),
      });
    } catch {}
    return NextResponse.json({ ok: true, action, result, status: evolution.getStatus() });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
