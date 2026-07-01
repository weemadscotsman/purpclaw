import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Thin proxy to the backend single-source-of-truth manifest
// (lib/system-manifest.js, exposed by the orchestrator at :7784/api/manifest
// and the unified API at :7780/api/manifest). The UI should read what's
// REAL — registered services, tools, agents, and provider lanes — from here
// rather than hand-maintained client lists.
const TARGETS = [
  process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780',
  process.env.PURPCLAW_ORCHESTRATOR_URL || 'http://127.0.0.1:7784',
];

export async function GET() {
  for (const base of TARGETS) {
    try {
      const upstream = await fetch(`${base}/api/manifest`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!upstream.ok) continue;
      const body = await upstream.text();
      if (!body || body.trim().length < 2) continue; // empty/stub response — try next target
      return new NextResponse(body, {
        status: 200,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/json',
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        },
      });
    } catch {
      // try next target
    }
  }
  // Return empty-but-valid shape so the UI still renders when backend is down.
  // Panels will show N/A / empty state instead of crashing.
  return NextResponse.json(
    {
      ok: true,
      degraded: true,
      message: 'backend services offline — UI rendering with empty state',
      agents: [],
      services: [],
      logs: [],
      jobs: [],
      apiConnected: false,
      towerConnected: false,
      orchestratorConnected: false,
      eventBusConnected: false,
    },
    {
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    }
  );
}
