import { NextRequest, NextResponse } from 'next/server';
// R5 fix: orquestrate forwards to :7784 which spawns workflows. Without
// auth, a LAN caller could submit arbitrary goals and burn the agent
// tower's runtime. Gate with operator auth + 10/min (workflows are heavy).
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// B15 fix: thin proxy for /api/orchestrate. The real endpoint lives on
// the orchestrator service at :7784. Before this fix, the UI
// (CommandPanel, etc.) hit /api/orchestrate on Next which 404s because
// unified_api.js doesn't expose it. Forward to the orchestrator and
// pass-through the response.

const TARGET = process.env.PURPCLAW_ORCHESTRATOR_URL || 'http://127.0.0.1:7784';

export async function POST(req: NextRequest) {
  // R5 fix: orchestrate forwards to :7784 which spawns workflows. Without
  // auth, a LAN caller could submit arbitrary goals and burn the agent
  // tower's runtime. Gate with operator auth + 10/min (workflows are heavy).
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'orchestrate', 10);
  if (limitado) return limitado;
  try {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': req.headers.get('content-type') || 'application/json' },
      body: await req.text(),
      // The orchestrate endpoint blocks until the full swarm mission completes
      // (coordinator → tower → agent), which routinely takes 30–120s. A 15s cap
      // aborted every real mission. 5-min ceiling matches the orchestrator's own.
      signal: AbortSignal.timeout(300_000),
    };
    const upstream = await fetch(`${TARGET}/api/orchestrate`, init);
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'orchestrator unreachable' },
      { status: 503 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    error: 'POST { command, source, ... } to start an orchestrated workflow',
    example: { command: "summarize today's events", source: 'mission-control' },
  });
}
