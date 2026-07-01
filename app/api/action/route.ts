import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dispatcher() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/action-dispatcher.js');
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const capability = url.searchParams.get('capability') || url.searchParams.get('id') || '';
    const task = url.searchParams.get('task') || '';
    if (!capability) return NextResponse.json({ ok: false, error: 'capability required' }, { status: 400 });
    const plan = dispatcher().buildActionPlan(capability, task, { source: 'web-action-plan' });
    return NextResponse.json({ ok: true, dryRun: true, plan }, { headers: { 'cache-control': 'no-store' } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limited = checkRateLimit(req, 'surface-action', 20);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const capability = String(body.capability || body.id || '').trim();
    const task = String(body.task || body.text || body.query || '').trim();
    if (!capability) return NextResponse.json({ ok: false, error: 'capability required' }, { status: 400 });
    const result = await dispatcher().dispatchAction(capability, task, {
      source: 'web-action',
      dryRun: body.dryRun === true,
      agent: body.agent,
      delegate: body.delegate !== false,
      depth: body.depth,
      modelCount: body.modelCount,
      limit: body.limit,
      mode: body.mode,
      timeoutMs: body.timeoutMs,
      to: body.to,
      message: body.message,
      service: body.service,
      confirmSend: body.confirmSend === true,
      peer: body.peer,
      channel: body.channel,
      thread: body.thread,
      targetCapability: body.targetCapability || body.target_capability,
      confirmDispatch: body.confirmDispatch === true,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
