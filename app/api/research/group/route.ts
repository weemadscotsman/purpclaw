import { NextRequest, NextResponse } from 'next/server';
// P0-3: defense-in-depth auth (research/group forwards to orchestrator).
import { checkOperator } from '../../_lib/operator-auth';
import { checkRateLimit } from '../../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // P0-3: operator auth + 10/min (research group spawns many sub-agents)
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'research-group', 10);
  if (limitado) return limitado;
  let body: any = null;
  try { body = await req.json(); } catch { /* ignore */ }

  // Try the orchestrator's swarm engine first (real /api/swarm is on :7784)
  const target = process.env.PURPCLAW_ORCHESTRATOR_URL || 'http://127.0.0.1:7784';
  try {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: body?.query || body?.message || body?.goal || 'research',
        depth: body?.depth || 2,
        modelLimit: body?.modelLimit || 5,
        selectedModels: body?.selectedModels,
        kernelJob: true,
        message: body?.query || body?.message,
      }),
      signal: AbortSignal.timeout(20_000),
    };
    const upstream = await fetch(`${target}/api/swarm/research`, init);
    if (upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/json',
          'access-control-allow-origin': '*',
        },
      });
    }
  } catch { /* fall through to 501 */ }

  return NextResponse.json({
    ok: false,
    error: 'research/group route not available — deep-research-group subsystem is dark',
    hint: 'Bring up PURPCLAW deep-research-group or call /api/chat with research: prefix',
    fallback: '/api/chat',
  }, { status: 501 });
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    error: 'POST { query, depth?, modelLimit? } to start a research run',
  });
}
