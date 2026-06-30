import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/discover — Agentic Resource Discovery (ARD) registry for PURPCLAW.
 *
 * The catalog is /api/manifest (the single source of truth: tools, agents,
 * lanes). This endpoint is the REGISTRY: an agent asks by INTENT ("what can
 * help me do X") and gets back RANKED capability matches — so the model never
 * has to carry all 181 tools + 45 agents in its head. Search outside the model.
 *
 *   GET  /api/discover?intent=read%20a%20file&kind=all&limit=8
 *   POST /api/discover  { intent, kind?, limit? }
 *
 * Returns: { intent, matches: [{ kind, name, score, why, invoke }], counts }
 */
const MANIFEST = (process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780') + '/api/manifest';
const STOP = new Set(['the','a','an','to','of','for','and','or','my','me','i','it','is','do','can','help','with','that','this','how','what','need','want','please','use']);

function tokens(s: string): string[] {
  return String(s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 1 && !STOP.has(w)) || [];
}

// Score a capability's text against the intent terms. Name hits weigh more
// than description hits; a full substring hit on the name is a strong signal.
function score(intentTerms: string[], name: string, body: string): { score: number; hits: string[] } {
  const nameT = new Set(tokens(name));
  const bodyT = new Set(tokens(body));
  const hits: string[] = [];
  let s = 0;
  for (const t of intentTerms) {
    if (nameT.has(t)) { s += 5; hits.push(t); }
    else if (bodyT.has(t)) { s += 2; hits.push(t); }
    else if ((name + ' ' + body).toLowerCase().includes(t)) { s += 1; hits.push(t); }
  }
  return { score: s, hits };
}

async function discover(intent: string, kind: string, limit: number) {
  const terms = tokens(intent);
  let m: any = {};
  try {
    const r = await fetch(MANIFEST, { signal: AbortSignal.timeout(6000) });
    m = await r.json();
  } catch {
    return { error: 'catalog (/api/manifest) unreachable', matches: [] };
  }

  const matches: any[] = [];
  if (kind === 'all' || kind === 'tool') {
    for (const t of (m.tools || [])) {
      const { score: sc, hits } = score(terms, t.name, [t.description, (t.aliases || []).join(' ')].join(' '));
      if (sc > 0) matches.push({
        kind: 'tool', name: t.name, score: sc, why: `matches: ${hits.join(', ')}`,
        description: (t.description || '').slice(0, 140),
        invoke: `{"tool": "${t.name}", "args": { ... }}`,
      });
    }
  }
  if (kind === 'all' || kind === 'agent') {
    for (const a of (m.agents || [])) {
      const nm = a.name || a.key || '';
      const { score: sc, hits } = score(terms, [nm, a.role].join(' '), [a.role, a.division, (a.skills || []).join(' '), (a.give || []).join(' ')].join(' '));
      if (sc > 0) matches.push({
        kind: 'agent', name: nm, score: sc, why: `matches: ${hits.join(', ')}`,
        description: `${a.role || ''} · ${a.division || ''}`.trim(),
        invoke: `{"tool": "spawn", "args": { "agent": "${(a.key || nm).toLowerCase()}", "task": "..." }}`,
      });
    }
  }
  matches.sort((x, y) => y.score - x.score);
  return {
    matches: matches.slice(0, limit),
    counts: { tools: (m.tools || []).length, agents: (m.agents || []).length },
  };
}

async function handle(intent: string, kind: string, limit: number) {
  if (!intent || !intent.trim()) {
    return NextResponse.json({ ok: false, error: 'provide ?intent=<what you want to do>' }, { status: 400 });
  }
  const res = await discover(intent, ['tool', 'agent', 'all'].includes(kind) ? kind : 'all', Math.min(Math.max(limit || 8, 1), 40));
  return NextResponse.json({ ok: !res.error, intent, ...res }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return handle(p.get('intent') || '', p.get('kind') || 'all', Number(p.get('limit')) || 8);
}

export async function POST(req: NextRequest) {
  let b: any = {};
  try { b = await req.json(); } catch {}
  return handle(b.intent || '', b.kind || 'all', Number(b.limit) || 8);
}
