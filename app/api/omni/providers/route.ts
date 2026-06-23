// OMNI-SURGEON — Phase Six: Provider Integrity cockpit API
// Reads the JSONL log and returns a summary.

import { NextRequest, NextResponse } from 'next/server';
import { cachedJson } from '../../../../lib/api-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNI_DIR = require('path').join(process.cwd(), 'agent_work', 'omni');
const fs = require('fs');
const path = require('path');

function readJsonl(name: string, limit = 200) {
  try {
    const p = path.join(OMNI_DIR, name);
    if (!fs.existsSync(p)) return [];
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l: string) => l.trim());
    return lines.slice(-limit).map((l: string) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const events = readJsonl('provider-integrity.jsonl', 200);
  // Stats
  const byProvider: Record<string, any> = {};
  for (const e of events) {
    const p = e.provider || '?';
    byProvider[p] = byProvider[p] || { total: 0, ok: 0, fail: 0, refusal: 0, lastAt: null };
    byProvider[p].total++;
    if (e.raw?.ok) byProvider[p].ok++;
    else byProvider[p].fail++;
    if (e.analysis?.refusal) byProvider[p].refusal++;
    byProvider[p].lastAt = e.at;
  }
  return cachedJson({
    ok: true,
    cycle: 'OMNI-SURGEON — Phase Six Provider Integrity',
    generatedAt: new Date().toISOString(),
    note: 'Read-only diagnostics. No auto-routing changes per master spec.',
    totalEvents: events.length,
    byProvider,
    recentEvents: events.slice(-5),
    readme: 'Gated, not gutted. Real, not simulated. The runner surfaces real failures (timeout, 401, etc.) as Provider Integrity Events; it does not change runtime routing.',
  }, 'omni-providers', req);
}
