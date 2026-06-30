/**
 * Shared helpers for the /api/harness/* adapter routes.
 *
 * The new Mission Control UI speaks one contract:
 *   POST /api/harness/start            { task, intent, options }
 *   GET  /api/harness/status
 *   GET  /api/harness/missions/:id     → { missionId, task, status, subtasks, synthesis }
 *   POST /api/harness/missions/:id/abort
 *
 * Our actual harness service (harness_service.js on :7798) speaks:
 *   POST /harness/run                  { goal, options }
 *   GET  /health
 *   GET  /harness/jobs/:id             → HarnessJob
 *   POST /harness/jobs/:id/stop
 *
 * These adapters translate between the two.
 */

export const HARNESS_PORT = Number(process.env.HARNESS_API_PORT || process.env.HARNESS_PORT || 7798);
export const HARNESS_BASE = `http://127.0.0.1:${HARNESS_PORT}`;

const STATE_MAP: Record<string, string> = {
  idle: 'queued',
  planning: 'decomposing',
  executing: 'running',
  reviewing: 'running',
  synthesizing: 'synthesizing',
  done: 'completed',
  failed: 'failed',
  stopped: 'aborted',
};

const SUBTASK_STATE_MAP: Record<string, string> = {
  pending: 'pending',
  in_progress: 'running',
  accepted: 'completed',
  challenged: 'running',
  rejected: 'failed',
  failed: 'failed',
};

export interface HarnessSubtask {
  id: string;
  index: number;
  description: string;
  rationale?: string;
  state: string;
  attempts?: number;
  verdict?: string;
  verdictReason?: string;
  output?: string;
  dispatchedTo?: string;
  contract?: {
    preferredAgents?: string[];
    type?: string;
    routeIntent?: string;
    verificationGates?: string[];
  };
  karenEscalations?: Array<{ at: number; decision: { action: string; reason: string } }>;
}

export interface HarnessJob {
  id: string;
  goal: string;
  state: string;
  plan?: HarnessSubtask[];
  finalReport?: string;
  iteration?: number;
  maxIterations?: number;
  toolsUsed?: number;
  classification?: { type?: string; confidence?: string };
  startedAt?: number;
  finishedAt?: number;
  persisted?: unknown;
  usedFallbackPlanner?: boolean;
}

export function toMission(job: HarnessJob | null | undefined): Record<string, unknown> | null {
  if ((job as any)?.missionId && Array.isArray((job as any)?.subtasks)) {
    return job as any;
  }
  if (!job?.id) return null;
  const subtasks = (job.plan || []).map((s, idx) => ({
    id: s.id,
    text: s.description,
    domain: s.contract?.type || s.contract?.routeIntent || 'unknown',
    agent: s.dispatchedTo || s.contract?.preferredAgents?.[0] || null,
    executionOrder: typeof s.index === 'number' ? s.index : idx,
    dependsOn: idx > 0 ? [(job.plan || [])[idx - 1]?.id].filter(Boolean) : [],
    status: SUBTASK_STATE_MAP[s.state] || s.state || 'pending',
    attempts: s.attempts || 0,
    verdict: s.verdict || null,
    output: s.output || '',
    error: s.state === 'failed' || s.state === 'rejected' ? (s.verdictReason || null) : null,
    karen: (s.karenEscalations || []).map(k => ({ action: k.decision?.action, reason: k.decision?.reason })),
    gates: s.contract?.verificationGates || [],
  }));

  const acceptedCount = (job.plan || []).filter(s => s.state === 'accepted').length;
  const totalCount = (job.plan || []).length;

  return {
    missionId: job.id,
    task: job.goal,
    status: STATE_MAP[job.state] || job.state || 'queued',
    subtasks,
    synthesis: job.finalReport
      ? {
          summary: job.finalReport,
          filesModified: extractFiles(job.finalReport),
          validationStatus: acceptedCount === totalCount && totalCount > 0 ? 'all-accepted' : `${acceptedCount}/${totalCount} accepted`,
        }
      : null,
    classification: job.classification || null,
    iteration: job.iteration,
    maxIterations: job.maxIterations,
    toolsUsed: job.toolsUsed,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.state === 'failed' ? 'Harness finished with failures' : null,
    raw: { state: job.state, persisted: job.persisted, usedFallbackPlanner: job.usedFallbackPlanner },
  };
}

function extractFiles(report: string): string[] {
  if (!report) return [];
  const matches = report.match(/(?:^|\s)([a-zA-Z0-9_\-./]+\.(?:js|ts|tsx|jsx|py|md|json|sql|yml|yaml|html|css))/g) || [];
  return Array.from(new Set(matches.map(s => s.trim()))).slice(0, 20);
}

export async function harnessFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${HARNESS_BASE}${path}`;
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}
