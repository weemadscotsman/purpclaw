import { NextRequest, NextResponse } from 'next/server';
// P0-3: defense-in-depth auth (llm/plan forwards to unified_api which is unauth'd at upstream).
import { checkOperator } from '../../_lib/operator-auth';
import { checkRateLimit } from '../../_lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canonical gateway for the "Plan" command mode.
 *
 * CommandPanel posts to /api/llm/plan, but no Next route existed → 404 (audit
 * B: dead command modes). Forwards server-side to the unified API's planner
 * (:7780 /api/llm/plan, verified 200). Loopback server-to-server, exempt from
 * the browser operator/CSRF guard.
 */
const API = process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';

export async function POST(req: NextRequest) {
  // P0-3: operator auth + 20/min (planning is a normal-cost operation)
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'llm-plan', 20);
  if (limitado) return limitado;
  let raw = '{}';
  try { raw = JSON.stringify(await req.json()); } catch {}
  try {
    const upstream = await fetch(`${API}/api/llm/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: 'planner unreachable', detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}
