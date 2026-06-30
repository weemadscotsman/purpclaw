import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// /api/registry — the live truth about what's actually loaded:
// provider drivers (lib/providers/registry), tools (lib/tools), alias map,
// and per-tool capability classes from the policy engine. No invented paths,
// no localStorage cosplay — this is what the runtime is really running.

export async function GET() {
  const out: Record<string, unknown> = { ok: true };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reg = require('../../../lib/providers/registry.js');
    out.drivers = (reg.listDrivers ? reg.listDrivers() : Object.keys(reg.DRIVERS || {})) || [];
  } catch (e: unknown) { out.drivers = []; out.driversError = e instanceof Error ? e.message : String(e); }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tools = require('../../../lib/tools/index.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let getCap: ((n: string) => string) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pol = require('../../../lib/runtime/policy-engine.js');
      getCap = pol.getCapability || null;
    } catch { /* policy optional */ }
    const list = tools.list();
    out.toolCount = list.length;
    out.tools = list.map((t: { name: string; description: string; aliases?: string[] }) => ({
      name: t.name,
      description: (t.description || '').slice(0, 120),
      aliases: t.aliases || [],
      capability: getCap ? getCap(t.name) : undefined,
    }));
    out.aliases = tools.aliases ? Object.fromEntries(tools.aliases) : {};
  } catch (e: unknown) { out.tools = []; out.toolsError = e instanceof Error ? e.message : String(e); }

  return NextResponse.json(out);
}
