import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// /api/heartbeat — read-only pulse for the cockpit. Uses the same canonical
// service registry as /api/services and doctor. NO mouse, NO VLM, NO actions.

async function probeService(service: any) {
  const healthPort = service.healthPort ?? service.port;
  const healthPath = service.healthPath || null;
  if (!healthPort || !healthPath) {
    return { id: service.key, ok: !service.required, skipped: true };
  }
  try {
    const res = await fetch(`http://127.0.0.1:${healthPort}${healthPath}`, {
      signal: AbortSignal.timeout(2500),
    });
    return { id: service.key, ok: res.ok, status: res.status };
  } catch (error: any) {
    return { id: service.key, ok: false, error: error?.message || 'offline' };
  }
}

export async function GET() {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const router = require('../../../lib/runtime/provider-router.js');
  const registry = require('../../../service_registry.js');
  let settings: any = null;
  try { settings = require('../../../lib/runtime/settings-registry.js'); } catch { /* optional */ }
  /* eslint-enable @typescript-eslint/no-var-requires */

  // Core health
  let core = { healthy: 0, total: 0, down: [] as string[] };
  try {
    const rows = Array.isArray(registry.SERVICES) ? registry.SERVICES : [];
    const coreRows = rows.filter((service: any) => service.group === 'core' || service.key === 'cognitive');
    const coreMembers = await Promise.all(coreRows.map(probeService));
    core = {
      healthy: coreMembers.filter((s: { ok: boolean }) => s.ok).length,
      total: coreMembers.length,
      down: coreMembers.filter((s: { ok: boolean }) => !s.ok).map((s: { id: string }) => s.id),
    };
  } catch { /* leave zeros */ }

  // Provider lanes
  let providers = { usable: 0, total: 0, fellBack: [] as string[] };
  try {
    const lanes = Object.keys(router.LANES || {});
    for (const name of lanes) {
      const c = router.resolveLane(router.LANES[name]);
      if (router.providerUsable(c.provider)) providers.usable++;
      if (c.fellBackFrom) providers.fellBack.push(`${name}<-${c.fellBackFrom}`);
    }
    providers.total = lanes.length;
  } catch { /* leave zeros */ }

  // Memory spine
  let memory = false;
  try {
    const r = await fetch('http://127.0.0.1:7880/cognitive/health', { signal: AbortSignal.timeout(3000) });
    const d = r.ok ? await r.json() : null;
    memory = !!d && (d.status === 'healthy' || d.status === 'online');
  } catch { /* down */ }

  // Body bridge safety (read-only)
  let mode = 'off', armed = false;
  if (settings) {
    try {
      const enabled = !!settings.get('computerUse.enabled')?.value;
      mode = enabled ? (settings.get('computerUse.mode')?.value || 'off') : 'off';
      armed = enabled && mode !== 'off' && mode !== 'observe';
    } catch { /* default off */ }
  }

  const green = core.down.length === 0 && providers.usable > 0 && memory && !armed;
  return NextResponse.json({
    ok: true,
    green,
    at: new Date().toISOString(),
    core, providers, memory: memory ? 'green' : 'down',
    hands: mode, autonomy: armed ? 'armed' : 'off',
  });
}
