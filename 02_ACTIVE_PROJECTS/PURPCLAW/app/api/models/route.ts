import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// /api/models — Model Sentinel surface.
//   GET                  → cached registry + last drift (instant, no network)
//   GET ?action=refresh  → live discovery + drift detection + report (network)
//   GET ?action=validate → live lane endpoint-drift check
// POST { provider, model } → smoke-test one model (SpendGate-governed)

export async function GET(req: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sentinel = require('../../../lib/model-sentinel.js');
    const action = new URL(req.url).searchParams.get('action');

    if (action === 'refresh') {
      const summary = await sentinel.runDaily({ force: true });
      return NextResponse.json({ ok: true, action: 'refresh', summary });
    }
    if (action === 'validate') {
      const discoveries = await sentinel.discoverAll();
      const drift = sentinel.detectDrift(discoveries);
      return NextResponse.json({ ok: true, action: 'validate', drift });
    }

    // Default: cached registry — fast, no provider calls.
    const reg = sentinel.loadRegistry();
    const providers = Object.entries(reg.providers || {}).map(([name, p]) => {
      const prov = p as { count: number; lastChecked?: string; models?: string[] };
      return { provider: name, count: prov.count, lastChecked: prov.lastChecked };
    });
    return NextResponse.json({
      ok: true,
      lastChecked: reg.lastChecked || null,
      providers,
      drift: reg.lastDrift || [],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sentinel = require('../../../lib/model-sentinel.js');
    const body = await req.json().catch(() => ({}));
    const { provider, model } = body || {};
    if (!provider || !model) {
      return NextResponse.json({ ok: false, error: 'provider and model required' }, { status: 400 });
    }
    const result = await sentinel.smokeTest(provider, model);
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
