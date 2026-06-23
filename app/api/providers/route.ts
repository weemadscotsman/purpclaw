import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// /api/providers
//   GET  → routing lanes (effective, with source + fallback), available
//          providers (which have keys), discovered models per provider, spend.
//   POST { lane, provider, model } → save a user's per-lane choice (or clear
//          a field by passing '' ). Nothing is hardcoded: defaults are only the
//          last resort; user config + env override them, and a missing key
//          falls back to a provider the user has, ending at the local model.

type Lane = { label: string; provider: string; envKey: string; modelEnv: string; defaultModel: string; useFor: string[] };

export async function GET() {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const router = require('../../../lib/runtime/provider-router.js');
    const config = require('../../../lib/runtime/provider-config.js');
    const sentinel = require('../../../lib/model-sentinel.js');
    const { SpendGate } = require('../../../lib/spend-gate.js');
    /* eslint-enable @typescript-eslint/no-var-requires */

    const LANES: Record<string, Lane> = router.LANES || {};
    const userCfg = config.load().lanes || {};

    const lanes = Object.entries(LANES).map(([name, lane]) => {
      const r = router.resolveLane(lane);            // effective, capability-aware
      return {
        lane: name,
        label: lane.label,
        provider: r.provider,
        model: r.model,
        source: r.source,                            // env | user-config | default
        fellBackFrom: r.fellBackFrom || null,
        userChoice: userCfg[name] || null,           // what the user explicitly set
        default: { provider: lane.provider, model: lane.defaultModel },
        useFor: lane.useFor,
      };
    });

    // Available providers: which have a usable key, + their discovered models.
    const reg = sentinel.loadRegistry();
    const regProviders: Record<string, { models?: string[] }> = reg.providers || {};
    const providerNames: string[] = sentinel.listKnownProviders();
    const available = providerNames.map((name: string) => ({
      provider: name,
      hasKey: router.providerUsable(name),
      models: (regProviders[name]?.models || []).slice(0, 400),
    }));

    let spend = null;
    try { spend = new SpendGate().getStatus(); } catch { /* optional */ }

    return NextResponse.json({ ok: true, lanes, available, spend });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require('../../../lib/runtime/provider-config.js');
    const body = await req.json().catch(() => ({}));
    const { lane, provider, model } = body || {};
    if (!lane) return NextResponse.json({ ok: false, error: 'lane required' }, { status: 400 });
    const saved = config.setLane(lane, { provider, model });
    return NextResponse.json({ ok: true, lanes: saved.lanes });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
