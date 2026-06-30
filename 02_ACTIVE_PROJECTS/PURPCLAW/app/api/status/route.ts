import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/status — aggregates live system metrics.
 *
 * Source of truth for every claim on the marketing page:
 *   - Agents (registered / divisions / active)   → /api/tower/status + /api/swarm
 *   - Tools (registered count)                  → lib/tools/index.js
 *   - Providers (registered)                    → lib/llm-provider.js
 *   - Memory (atom count)                       → /cognitive/health.memory.stats
 *   - Health (api / spine / bridge)             → /api/health + /cognitive/health
 *   - OmniCode token savings                    → .omnicode/benchmark.json (sum of savedBytes)
 */
const API_HEALTH     = 'http://127.0.0.1:7780/api/health';
const SPINE_HEALTH   = 'http://127.0.0.1:7880/cognitive/health';
const SWARM_LIST     = 'http://127.0.0.1:7780/api/swarm';
const TOWER_STATUS   = 'http://127.0.0.1:7780/api/tower/status';

// Per-endpoint timeouts. The cognitive spine needs ~40 s of warm-up before
// its first `/cognitive/health` answer, and it gz-flushes memory back to disk
// after every ingest. A 4 s timeout races both windows — the client aborts mid
// flush, the spine raises ConnectionAbortedError, the worker thread dies, and
// eventually the process goes unresponsive. Timeouts below are sized to the
// worst observed warm-up plus a real safety margin.
const TIMEOUT_MS = {
  api:     8_000,   // /api/health, /api/swarm, /api/tower/status — small, hot
  spine:   60_000,  // /cognitive/health — first call after a cold start
};

async function fetchJson(url: string, timeoutMs: number) {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function readOmniSavings(): { savedBytes: number; reductionPercent: number; payloadBytes: number; baselineBytes: number } {
  const empty = { savedBytes: 0, reductionPercent: 0, payloadBytes: 0, baselineBytes: 0 };
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(process.cwd(), '.omnicode', 'benchmark.json');
    if (!fs.existsSync(p)) return empty;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const baseline = Number(raw?.cumulative?.baseline_bytes || 0);
    const payload  = Number(raw?.cumulative?.payload_bytes || 0);
    const savedBytes = Math.max(0, baseline - payload);
    const reductionPct = Number(raw?.cumulative?.reduction_percent || 0);
    return { savedBytes, reductionPercent: reductionPct, payloadBytes: payload, baselineBytes: baseline };
  } catch {
    return empty;
  }
}

export async function GET() {
  try {
    const [apiHealth, spineHealth, swarm, tower] = await Promise.all([
      fetchJson(API_HEALTH,   TIMEOUT_MS.api),
      fetchJson(SPINE_HEALTH, TIMEOUT_MS.spine),
      fetchJson(SWARM_LIST,   TIMEOUT_MS.api),
      fetchJson(TOWER_STATUS, TIMEOUT_MS.api),
    ]);

    const toolRegistry = require('../../../lib/tools/index.js');
    const llmProvider  = require('../../../lib/llm-provider.js');

    const toolsRegistered = toolRegistry.tools.size;
    const providers       = Object.keys(llmProvider.PROVIDERS || {}).length;

    const agentsRegistered = tower?.tower?.totalRegistered ?? 0;
    const divisions        = tower?.divisions ? Object.keys(tower.divisions).length : 0;
    const activeAgents     = Array.isArray(swarm) ? swarm.length : 0;
    const memoryAtoms      = spineHealth?.services?.memory?.stats?.total_atoms ?? 0;
    const omni             = readOmniSavings();

    const status = {
      agents: {
        registered: agentsRegistered,
        active: activeAgents,
        divisions,
      },
      tools: { registered: toolsRegistered },
      providers,
      memory: {
        atoms: memoryAtoms,
        service: spineHealth?.services?.memory?.status ?? 'unknown',
        realtime: {
          available: !!spineHealth?.services?.realtime?.available,
          ring: spineHealth?.services?.realtime?.ring ?? null,
          working_memory: spineHealth?.services?.realtime?.working_memory ?? null,
          import_error: spineHealth?.services?.realtime?.import_error ?? null,
        },
      },
      omnicode: {
        savedBytes: omni.savedBytes,
        reductionPercent: omni.reductionPercent,
        baselineBytes: omni.baselineBytes,
        payloadBytes: omni.payloadBytes,
      },
      health: {
        api: apiHealth?.status ?? 'unknown',
        spine: spineHealth?.status ?? 'unknown',
        bridgeConnected: apiHealth?.bridgeConnected ?? false,
      },
      uptime: apiHealth?.uptime ?? null,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(status);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}