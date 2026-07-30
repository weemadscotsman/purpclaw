import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function readJsonFile(filePath: string, fallback: any) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readLlmLedger(limit = 100) {
  const ledgerPath = path.join(process.cwd(), 'agent_work', 'llm-ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) {
    return { totalCalls: 0, totalTokens: 0, totalCost: 0 };
  }
  // Tail-read: only parse the last N lines instead of 2009.
  // For totals we don't need history, just the recent tail.
  const content = fs.readFileSync(ledgerPath, 'utf8');
  const allLines = content.trim().split('\n').filter(Boolean);
  const lines = allLines.slice(-limit);
  return lines.reduce((summary, line) => {
    try {
      const entry = JSON.parse(line);
      summary.totalCalls += 1;
      summary.totalTokens += entry.total_tokens || 0;
      summary.totalCost += entry.estimatedCost || 0;
    } catch {}
    return summary;
  }, { totalCalls: 0, totalTokens: 0, totalCost: 0 });
}

function compactText(value: string, max = 120) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function compactResearchRun(run: any) {
  if (!run || typeof run !== 'object') return run;
  return {
    ok: run.ok,
    mode: run.mode,
    query: compactText(run.query, 160),
    depth: run.depth,
    requestedModelCount: run.requestedModelCount,
    freeModelCount: run.freeModelCount,
    memberCount: run.memberCount,
    successCount: run.successCount,
    sourceCount: run.sourceCount,
    synthesisError: compactText(run.synthesisError, 220),
    createdAt: run.createdAt,
    sources: Array.isArray(run.sources)
      ? run.sources.slice(0, 8).map((source: any) => ({
          url: compactText(source?.url, 180),
          ok: source?.ok,
          error: compactText(source?.error, 160),
        }))
      : [],
    members: Array.isArray(run.members)
      ? run.members.slice(0, 12).map((member: any) => ({
          model: member?.model,
          name: member?.name,
          status: member?.status,
          error: compactText(member?.error, 180),
          startedAt: member?.startedAt,
          completedAt: member?.completedAt,
        }))
      : [],
  };
}

function compactKernelJob(job: any) {
  return {
    id: job.id,
    goal: compactText(job.goal, 240),
    state: job.state,
    route: job.route,
    mode: job.mode,
    dryRun: job.dryRun,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: job.durationMs,
    linkedMissionId: job.linkedMissionId,
    repoPath: job.repoPath,
    omnicodeIntake: job.omnicodeIntake
      ? {
          ok: job.omnicodeIntake.ok,
          mode: job.omnicodeIntake.mode,
          repoPath: job.omnicodeIntake.repoPath,
          proof: job.omnicodeIntake.proof,
        }
      : null,
    classification: job.classification,
    contract: job.contract,
    governance: job.governance
      ? {
          mode: job.governance.mode,
          requiresApproval: job.governance.requiresApproval,
          allowed: job.governance.allowed,
          approvalId: job.governance.approvalId,
          risks: job.governance.risks,
        }
      : null,
    eventCount: job.eventCount,
    events: Array.isArray(job.events)
      ? job.events.slice(-6).map((event: any) => ({
          at: event.at,
          iso: event.iso,
          type: event.type,
          stage: event.stage,
          message: compactText(event.message, 180),
        }))
      : [],
    finalReportPreview: compactText(job.finalReport, 420),
    error: compactText(job.error, 260),
    researchRun: compactResearchRun(job.researchRun),
  };
}

function readKernelJobs(limit = 20) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApiHarnessKernel } = require('../../../lib/api-harness-kernel.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const swarmCoordinator = require('../../../swarm_coordinator.js');
    return { jobs: getApiHarnessKernel({ rootDir: process.cwd(), swarmCoordinator }).listJobs(limit) };
  } catch {
    return { jobs: [] };
  }
}

function compactResearchStatus(status: any) {
  if (!status || typeof status !== 'object') return status;
  return {
    ok: status.ok,
    provider: status.provider,
    baseUrl: status.baseUrl,
    hasKey: status.hasKey,
    keySource: status.keySource,
    groupFallback: status.groupFallback,
    mode: status.mode,
    active: status.active,
    latest: status.latest ? compactKernelJob(status.latest) : null,
    jobs: Array.isArray(status.jobs) ? status.jobs.slice(0, 8).map(compactKernelJob) : [],
  };
}

function compactEvent(event: any) {
  return {
    id: event?.id,
    topic: compactText(event?.topic || event?.type, 100),
    type: compactText(event?.type, 80),
    source: compactText(event?.source, 80),
    message: compactText(event?.message || event?.payload?.message || event?.event?.message, 180),
    timestamp: event?.timestamp || event?.iso || event?.at,
  };
}

export async function GET() {
  async function getJson(url: string, fallback: any) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      return res.ok ? await res.json() : fallback;
    } catch {
      return fallback;
    }
  }

  try {
    const [apiHealth, apiControl, tower, bus, pipeline, omnicode, delegation, llmStatus, researchStatus] = await Promise.all([
      getJson('http://127.0.0.1:7780/api/health', { status: 'unavailable' }),
      getJson('http://127.0.0.1:7780/api/status', { status: 'unavailable' }),
      getJson('http://127.0.0.1:7790/tower/status', { activeAgents: [], registeredAgents: [], teams: [] }),
      getJson('http://127.0.0.1:7782/state', { recentEvents: [] }),
      getJson('http://127.0.0.1:7784/api/pipeline', null),
      getJson('http://127.0.0.1:7780/api/omnicode/status', null),
      getJson('http://127.0.0.1:7780/api/delegation/status', null),
      getJson('http://127.0.0.1:7780/api/llm/status', null),
      getJson('http://127.0.0.1:7780/api/research/status', null),
    ]);
    const kernel = readKernelJobs(20);
    const agentScores = readJsonFile(path.join(process.cwd(), 'agent_score.json'), {
      meta: { totalTasksRecorded: 0 },
      agents: {},
      intents: {},
      history: [],
    });
    const llmLedger = readLlmLedger();

    return NextResponse.json({
      api: {
        ...apiControl,
        ...apiHealth,
        controlStatus: apiControl?.status || 'unavailable',
        healthStatus: apiHealth?.status || 'unavailable',
        status: apiHealth?.status === 'healthy' ? 'healthy' : (apiControl?.status || apiHealth?.status || 'unavailable'),
        bridgeConnected: Boolean(apiHealth?.bridgeConnected ?? apiControl?.bridgeConnected),
      },
      tower,
      eventBus: { recentEvents: (bus.recentEvents || []).slice(-25).map(compactEvent) },
      pipeline,
      kernelJobs: Array.isArray(kernel.jobs) ? kernel.jobs.map(compactKernelJob) : [],
      omnicodeStatus: omnicode,
      delegationStatus: delegation,
      llmStatus,
      researchStatus: compactResearchStatus(researchStatus),
      agentScores: {
        meta: agentScores.meta || { totalTasksRecorded: 0 },
        agentCount: Object.keys(agentScores.agents || {}).length,
        intentCount: Object.keys(agentScores.intents || {}).length,
        recent: (agentScores.history || []).slice(-20).reverse().map((row: any) => ({
          agent: compactText(row.agent, 40),
          intent: compactText(row.intent, 80),
          success: Boolean(row.success),
          duration: row.duration || 0,
          timestamp: row.timestamp,
        })),
      },
      llmLedger,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
