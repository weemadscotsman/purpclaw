import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// L1 fix: use the canonical projectPath() helper instead of process.cwd()
// so the worktree dev server (which has a different cwd) can still find
// the real agent_work/ directory at the canonical root.
import { projectPath } from '@/lib/runtime/project-paths';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// B15 fix: /api/llm/status. Before this fix, the endpoint 404'd and the
// mission-data aggregator returned null for llmStatus. Derive the status
// from the actual LLM ledger (real token counts and cost) plus the
// configured provider so the panel can show "alive: minimax, 178 tokens
// this session" instead of "—".

const LEDGER_PATH = projectPath('agent_work', 'llm-ledger.jsonl');

function ledgerSummary() {
  try {
    if (!fs.existsSync(LEDGER_PATH)) {
      return { totalCalls: 0, totalTokens: 0, totalCost: 0, lastCall: null };
    }
    const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let lastEntry: any = null;
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        totalCalls += 1;
        totalTokens += e.total_tokens || 0;
        totalCost += e.estimatedCost || 0;
        if (!lastEntry || (e.timestamp && e.timestamp > lastEntry.timestamp)) {
          lastEntry = e;
        }
      } catch { /* skip malformed */ }
    }
    return {
      totalCalls,
      totalTokens,
      totalCost: parseFloat(totalCost.toFixed(4)),
      lastCall: lastEntry ? {
        timestamp: lastEntry.timestamp,
        provider: lastEntry.provider,
        model: lastEntry.model,
        tokens: lastEntry.total_tokens,
        cost: lastEntry.estimatedCost,
      } : null,
    };
  } catch {
    return { totalCalls: 0, totalTokens: 0, totalCost: 0, lastCall: null };
  }
}

function configured() {
  try {
    const reg = require('../../../lib/runtime/settings-registry.js');
    const pick = (k: string) => {
      try {
        const v = reg.get(k);
        return v && typeof v === 'object' && 'value' in v ? (v as any).value : v;
      } catch { return null; }
    };
    return {
      provider: pick('core.provider') || pick('LLM_PROVIDER') || 'minimax',
      model: pick('core.model') || pick('LLM_MODEL') || 'MiniMax-M2.7',
      fallback: pick('LLM_FALLBACK') || 'ollama',
      fallbackModel: pick('LLM_FALLBACK_MODEL') || 'qwen2.5:3b',
    };
  } catch {
    return { provider: 'unknown', model: 'unknown', fallback: 'ollama', fallbackModel: 'qwen2.5:3b' };
  }
}

export async function GET(_req: NextRequest) {
  const cfg = configured();
  const summary = ledgerSummary();
  return NextResponse.json({
    ok: true,
    configured: cfg,
    summary,
    status: summary.totalCalls > 0 ? 'live' : 'no-calls-yet',
  });
}
