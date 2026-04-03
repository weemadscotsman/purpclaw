import { NextRequest, NextResponse } from 'next/server';
import { harnessFetch, toMission, type HarnessJob } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/harness/start
 * Body: { task: "...", intent?: "...", options?: { source?, executionMode?, maxIter?, retries? } }
 * → Maps to harness_service /harness/run { goal, options }
 * → Returns the mission shape the UI expects, with missionId === jobId.
 */
export async function POST(request: NextRequest) {
  let body: any = {};
  try { body = await request.json(); } catch {}

  const goal = String(body?.task || body?.goal || '').trim();
  if (!goal) {
    return NextResponse.json(
      { error: 'task-required', hint: 'Provide { "task": "..." }' },
      { status: 400 }
    );
  }

  const options = {
    maxIter: body?.options?.maxIter ?? body?.options?.maxIterations,
    retries: body?.options?.retries ?? body?.options?.maxRetriesPerSubtask,
    source: body?.options?.source || 'mission-control-ui',
    executionMode: body?.options?.executionMode || 'live',
    intent: body?.intent || null,
  };

  try {
    const r = await harnessFetch('/api/harness/start', {
      method: 'POST',
      body: JSON.stringify({ task: goal, intent: body?.intent || 'complex-productivity-harness', options }),
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: 'harness-service-rejected', upstreamStatus: r.status, detail: text.slice(0, 400) },
        { status: 502 }
      );
    }

    const accepted = await r.json();
    const mission = toMission(accepted.mission as HarnessJob) || accepted.mission || {
      missionId: accepted.missionId || accepted.jobId,
      task: goal,
      status: 'queued',
      subtasks: [],
      synthesis: null,
      error: null,
    };

    return NextResponse.json(mission);
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.name === 'TimeoutError' ? 'timeout' : 'harness-service-offline',
        hint: 'Start with: purpclaw safe-start harness',
      },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
