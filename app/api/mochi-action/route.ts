import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POOL_URL      = 'http://127.0.0.1:7885';
const REASONING_URL = 'http://127.0.0.1:7892';
const AUTODREAM_URL = 'http://127.0.0.1:7895';
const TIMEOUT_MS    = 8000;

async function call(url: string, method = 'GET', body?: object) {
  const init: RequestInit = {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  return r.ok ? r.json() : null;
}

// Random pool queries for the PLAY action
const PLAY_QUERIES = [
  'orchestration workflow', 'memory recall', 'agent capabilities', 'skill search',
  'swarm diagnostics', 'context handoff', 'governance policy', 'task decomposition',
  'code review analysis', 'reasoning loop status',
];

export async function POST(request: NextRequest) {
  let body: { action?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const action = body.action;

  // ── FEED — fire a reasoning heartbeat tick (with pool fallback) ────────────
  if (action === 'feed') {
    let result: any = null;
    let primaryErr: string | null = null;
    try {
      result = await call(`${REASONING_URL}/tick`, 'POST');
    } catch (e: any) {
      primaryErr = e?.message || 'unknown';
    }
    if (result?.ok) {
      const s = result.summary;
      const msg = s
        ? `Heartbeat fired — ${s.online}/${s.total} services online`
        : 'Heartbeat fired — pool fed';
      return NextResponse.json({ ok: true, action, message: msg, detail: result });
    }
    // Reasoning loop offline (or returned non-ok) — fall back to writing a heartbeat memory directly to pool
    let fallback: any = null;
    let fallbackErr: string | null = null;
    try {
      fallback = await call(`${POOL_URL}/pool/memory/append`, 'POST', {
        content: 'Manual feed — heartbeat written via Mochi button',
        topic: 'heartbeat',
        agent: 'mochi',
        keywords: ['heartbeat', 'feed', 'manual'],
      });
    } catch (e: any) {
      fallbackErr = e?.message || 'unknown';
    }
    return NextResponse.json({
      ok: !!fallback?.ok,
      action,
      message: fallback?.ok
        ? 'Pool fed — heartbeat written to memory (reasoning loop offline)'
        : `Pool offline — could not feed right now (${fallbackErr || 'unknown'})`,
      primary_error: primaryErr,
    });
  }

  // ── PLAY — query the pool for a random skill ───────────────────────────────
  if (action === 'play') {
    const q = PLAY_QUERIES[Math.floor(Math.random() * PLAY_QUERIES.length)];
    try {
      const result = await call(`${POOL_URL}/pool/skills/search?q=${encodeURIComponent(q)}&limit=3`);
      if (result?.results?.length) {
        const found = result.results.map((r: any) => r.name || r.title).slice(0, 3).join(', ');
        return NextResponse.json({
          ok: true, action,
          message: `Queried pool for "${q}" — found ${result.count} skills`,
          detail: { query: q, found },
        });
      }
      return NextResponse.json({
        ok: true, action,
        message: `Queried pool for "${q}" — no matches (pool might be empty)`,
        detail: { query: q },
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, action, error: e.message }, { status: 503 });
    }
  }

  // ── CLEAN — record a spaghetti audit marker + clear failure log ────────────
  if (action === 'clean') {
    try {
      const poolStats = await call(`${POOL_URL}/pool/stats`);
      const failures = poolStats?.failures ?? 'unknown';
      const mem = await call(`${POOL_URL}/pool/memory/append`, 'POST', {
        content: `Spaghetti audit initiated via Mochi clean action. ${failures} failures on record at audit time.`,
        topic: 'audit',
        agent: 'mochi',
        keywords: ['audit', 'clean', 'spaghetti', 'failures', 'maintenance'],
      });
      return NextResponse.json({
        ok: !!mem?.ok,
        action,
        message: mem?.ok
          ? `Audit marker written — ${failures} failures on record. Run purpclaw spaghetti for full report.`
          : 'Pool offline — could not write audit marker',
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, action, error: e.message }, { status: 503 });
    }
  }

  // ── SLEEP — trigger autoDream consolidation + write dream marker ──────────
  if (action === 'sleep') {
    let recentFailures: any = null;
    let failCount = 0;
    try {
      recentFailures = await call(`${POOL_URL}/pool/failures/similar?q=recent`);
      failCount = recentFailures?.count ?? 0;
    } catch { /* pool offline; still try to dream */ }

    // Try to trigger autoDream server directly (offline = expected in dark cluster)
    let dreamResult: any = null;
    let dreamErr: string | null = null;
    try {
      dreamResult = await call(`${AUTODREAM_URL}/dream`, 'POST', { force: false });
    } catch (e: any) {
      dreamErr = e?.message || 'unknown';
    }
    const dreamMsg = dreamResult?.skipped
      ? 'below threshold — dream skipped'
      : dreamResult?.rulesExtracted !== undefined
        ? `dream cycle complete — ${dreamResult.entriesMerged ?? 0} merged, ${dreamResult.rulesExtracted ?? 0} rules extracted`
        : null;

    // Write marker to pool memory regardless (always try the pool)
    let mem: any = null;
    let memErr: string | null = null;
    try {
      mem = await call(`${POOL_URL}/pool/memory/append`, 'POST', {
        content: `Dream consolidation triggered via Mochi sleep action. ${failCount} failures reviewed. ${dreamMsg ?? 'autoDream offline — consolidation queued for next cycle.'}`,
        topic: 'dream',
        agent: 'mochi',
        keywords: ['dream', 'consolidation', 'memory', 'sleep', 'dedup', 'patterns'],
      });
    } catch (e: any) {
      memErr = e?.message || 'unknown';
    }

    const msg = mem?.ok
      ? (dreamMsg
          ? `${dreamMsg} — ${failCount} failure patterns reviewed`
          : `Dream marker written — ${failCount} failure patterns queued for consolidation. AutoDream offline; run purpclaw dream when pool is live.`)
      : `Pool offline — could not write dream marker (${memErr || 'unknown'})`;

    return NextResponse.json({
      ok: !!mem?.ok,
      action,
      message: msg,
      detail: { dreamResult, failCount, dream_error: dreamErr, mem_error: memErr },
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown action', validActions: ['feed', 'play', 'clean', 'sleep'] }, { status: 400 });
}
