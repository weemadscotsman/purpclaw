import { NextRequest, NextResponse } from 'next/server';
// R5 fix: orquestrate forwards to :7784 which spawns workflows. Without
// auth, a LAN caller could submit arbitrary goals and burn the agent
// tower's runtime. Gate with operator auth + 10/min (workflows are heavy).
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/orchestrate — thin proxy to orchestrator service :7784.
 *
 * SPINE CONTRACT (2026-06-23, Eddie's fix):
 *   Every request opens a message envelope. The upstream response
 *   is stamped with one of the 5 terminal states; failures now
 *   return a JSON body with state: failed instead of an opaque 503.
 *
 *   The orchestrate endpoint blocks until the full swarm mission
 *   completes (coordinator → tower → agent), which routinely
 *   takes 30–120s. 5-min ceiling matches the orchestrator's own.
 */

const TARGET = process.env.PURPCLAW_ORCHESTRATOR_URL || 'http://127.0.0.1:7784';

function spine() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/spine/envelope');
}
function contract() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/spine/contract');
}

export async function POST(req: NextRequest) {
  // R5 fix: orchestrate forwards to :7784 which spawns workflows.
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'orchestrate', 10);
  if (limitado) return limitado;

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch {}
  const command = String(body?.command || body?.goal || '').trim();

  const sessionId = body?.sessionId || req.headers.get('x-purpclaw-session') || null;
  const env = spine().createEnvelope({
    sessionId,
    route: 'mission',
    userText: command || '(no command)',
    source: 'app-api/orchestrate',
  });
  spine().setStatus(env, 'pending', { provider: 'orchestrator:7784', model: 'swarm-coordinator' });

  try {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': req.headers.get('content-type') || 'application/json',
        'x-purpclaw-envelope': env.id,
      },
      body: await req.text(),
      signal: AbortSignal.timeout(300_000),
    };
    const upstream = await fetch(`${TARGET}/api/orchestrate`, init);
    const text = await upstream.text();
    const c = contract();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    const cls = c.classifyHttp(upstream.status);
    const state = cls ? cls.status : (parsed?.state || 'answered');
    const errorCode = cls ? cls.errorCode : (parsed?.errorCode || null);
    spine().setStatus(env, state, {
      provider: 'orchestrator:7784',
      errorCode,
      error: errorCode ? { message: text.slice(0, 200) } : undefined,
      artifacts: parsed ? { missionId: parsed.missionId || parsed.id, finalReport: parsed.finalReport } : null,
    });
    const body2 = parsed
      ? { ok: env.status === 'answered', state: env.status, envelopeId: env.id, errorCode: env.errorCode, error: env.error, source: 'orchestrator:7784', ...parsed }
      : { ok: upstream.ok, state: env.status, envelopeId: env.id, errorCode: env.errorCode, error: env.error, source: 'orchestrator:7784', body: text };
    return new NextResponse(JSON.stringify(body2), {
      status: upstream.status,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  } catch (e: any) {
    spine().setStatus(env, 'failed', {
      errorCode: 'unavailable',
      error: { message: e?.message || 'orchestrator unreachable' },
    });
    return NextResponse.json(
      { ok: false, state: 'failed', errorCode: 'unavailable', error: { message: e?.message || 'orchestrator unreachable' }, envelopeId: env.id },
      { status: 503 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    state: 'failed',
    errorCode: 'method_not_allowed',
    error: { message: 'POST { command, source, ... } to start an orchestrated workflow' },
    example: { command: "summarize today's events", source: 'mission-control' },
  });
}
