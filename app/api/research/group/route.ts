import { NextRequest, NextResponse } from 'next/server';
// P0-3: defense-in-depth auth (research/group forwards to orchestrator).
import { checkOperator } from '../../_lib/operator-auth';
import { checkRateLimit } from '../../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/research/group — multi-model research synthesis.
 *
 * SPINE CONTRACT (2026-06-23, Eddie's fix):
 *   Every response is stamped with a 5-state terminal value
 *   {answered, delegated, failed, pending, no-output} via
 *   lib/spine/envelope. Each request opens a message envelope so
 *   the OMNI-SURGEON scanner can prove the round trip. The deep-
 *   research-group engine runs first; if it returns no answers,
 *   the local provider (NVIDIA NIM / minimax via :7780) is the
 *   fallback. Failures now report as `state: failed` with a
 *   visible card — no more silent 501s.
 */

function spine() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/spine/envelope');
}
function contract() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/spine/contract');
}

function terminal(env: any, httpStatus: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    ok: env.status === 'answered',
    state: env.status,
    envelopeId: env.id,
    errorCode: env.errorCode,
    error: env.error,
    ...extra,
  }, { status: httpStatus });
}

export async function POST(req: NextRequest) {
  // P0-3: operator auth + 10/min (research group spawns many sub-agents)
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'research-group', 10);
  if (limitado) return limitado;
  let body: any = null;
  try { body = await req.json(); } catch { /* ignore */ }

  const query = String(body?.query || body?.message || body?.goal || '').trim();
  if (!query) {
    return NextResponse.json({
      ok: false,
      state: 'failed',
      errorCode: 'invalid_input',
      error: { message: 'query is required (POST { query, depth?, modelLimit? })' },
    }, { status: 400 });
  }

  const sessionId = body?.sessionId || req.headers.get('x-purpclaw-session') || null;
  const env = spine().createEnvelope({
    sessionId,
    route: 'research',
    userText: query,
    source: 'app-api/research/group',
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const deepResearch = require('../../../../lib/deep-research-group');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const reg = (() => { try { return require('../../../../lib/pipeline-registry'); } catch { return null; } })();
  let jobId: string | undefined;
  let research: any = null;

  // Stage 1: the OpenRouter free-model group. Wrapped so a THROW (network blip,
  // no key) doesn't skip the fallback below — it just leaves research empty.
  try {
    const job = reg?.start?.({ pipeline: 'research.group', project: 'PURPCLAW', lane: 'Research', trigger: 'api', inputs: { query: query.slice(0, 160) } });
    jobId = job?.job_id;
    if (jobId) {
      spine().setStatus(env, 'pending', { jobId, provider: 'deep-research-group' });
    }
    if (reg && jobId) reg.step(jobId, 'gathering sources + models');
    research = await deepResearch.runGroupResearch({
      query,
      depth: Number(body?.depth ?? 2),
      modelLimit: Number(body?.modelLimit ?? 5),
      concurrency: Number(body?.concurrency ?? 3),
      memberMaxTokens: 800,
      synthesisMaxTokens: 1500,
      selectedModels: body?.selectedModels,
      operatorMessages: body?.operatorMessages,
    });
  } catch (e: any) {
    research = { ok: false, _threw: e?.message || String(e) };
  }

  // Group succeeded → return it.
  if (research?.ok && (research.successCount || 0) > 0) {
    if (reg && jobId) {
      reg.output(jobId, `research:${query.slice(0, 40)}`, { kind: 'synthesis', summary: String(research.synthesis || '').slice(0, 200) });
      reg.finish(jobId, { status: 'complete', claim: `${research.successCount} models answered`, proof: { ran: 'deep-research-group', result: 'pass', detail: `${research.successCount} answered` } });
    }
    spine().setStatus(env, 'answered', {
      provider: 'deep-research-group',
      artifacts: { synthesis: research.synthesis, sources: research.sources, successCount: research.successCount },
    });
    return terminal(env, 200, { mode: 'group', query, successCount: research.successCount, sources: research.sources, synthesis: research.synthesis });
  }

  // Stage 2 FALLBACK (covers group-returned-empty AND group-threw): synthesize
  // from any sources gathered, using the working local provider (NVIDIA NIM /
  // minimax). The LLM still answers from its own knowledge if sources are empty.
  // Buttery: research returns a usable result instead of going dark.
  if (reg && jobId) reg.step(jobId, 'fallback: local-provider synthesis');
  try {
    const UPSTREAM = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';
    const srcPack = JSON.stringify(research?.sources || {}).slice(0, 20000);
    spine().setStatus(env, 'pending', { provider: 'unified_api:7780', model: 'fallback-synth' });
    const r = await fetch(`${UPSTREAM}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PurpClaw-Envelope': env.id },
      body: JSON.stringify({
        message: `You are PURPCLAW's research synthesizer. Using these web sources plus your own knowledge, answer the query thoroughly and accurately. Cite sources inline where relevant. Be direct and well-structured.\n\nRESEARCH QUERY: ${query}\n\nWEB SOURCES (JSON):\n${srcPack}\n\nSynthesize a complete answer.`,
        spawnAgents: false,
        source: 'research-fallback',
        sessionId,
        envelopeId: env.id,
      }),
      signal: AbortSignal.timeout(85_000),
    });
    const data = await r.json().catch(() => ({} as any));
    const synthesis = (data?.reply || data?.data?.reply || data?.content || '').trim();
    if (synthesis && synthesis.length > 40) {
      const usedModel = data?.model || data?.data?.model || 'router';
      if (reg && jobId) {
        reg.output(jobId, `research:${query.slice(0, 40)}`, { kind: 'synthesis', summary: synthesis.slice(0, 200) });
        reg.finish(jobId, { status: 'complete', claim: `local-provider research synthesis (${usedModel})`, proof: { ran: 'unified_api:7780/api/chat', result: 'pass', detail: 'openrouter-fallback' } });
      }
      spine().setStatus(env, 'answered', {
        provider: 'unified_api:7780',
        model: usedModel,
        artifacts: { synthesis, sources: research?.sources },
      });
      return terminal(env, 200, {
        mode: 'local-provider-fallback',
        query, model: usedModel, successCount: 1, sources: research?.sources, synthesis,
      });
    }
    throw new Error('local provider returned empty synthesis (upstream :7780/api/chat)');
  } catch (fbErr: any) {
    if (reg && jobId) { try { reg.finish(jobId, { status: 'failed', claim: 'research failed (group + fallback)' }); } catch {} }
    spine().setStatus(env, 'failed', {
      errorCode: 'unavailable',
      error: {
        message: 'research produced no answers; fallback failed: ' + (fbErr?.message || String(fbErr)),
        groupError: research?._threw || research?.synthesisError,
        hint: 'Add OPENROUTER_API_KEY for the multi-model group, or ensure the local LLM provider (NVIDIA NIM / minimax) is reachable.',
        fallback: '/api/chat',
      },
    });
    return terminal(env, 502, { error: 'research produced no answers; fallback failed' });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    state: 'failed',
    errorCode: 'method_not_allowed',
    error: { message: 'POST { query, depth?, modelLimit? } to start a research run' },
  });
}
