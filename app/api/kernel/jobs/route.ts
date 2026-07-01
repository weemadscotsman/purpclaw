import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../../_lib/operator-auth';
import { checkRateLimit } from '../../_lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/kernel/jobs — kernel job lifecycle (create / list).
 *
 * SPINE CONTRACT (2026-06-23, Eddie's fix):
 *   Every create opens a message envelope. The kernel emits a 'job'
 *   event on completion; we listen for it and stamp the envelope
 *   with the right state. The chat UI polls GET /api/kernel/jobs/[id]
 *   to render the right card.
 *
 *   This was the silent-exit lane — kernel jobs returned 202 then
 *   dropped on the floor. Now the envelope carries the state all
 *   the way through.
 */

const envelopeBridges = new Map<string, any>();

function spine() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/spine/envelope');
}
function contract() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/spine/contract');
}

function kernel() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getApiHarnessKernel } = require('../../../../lib/api-harness-kernel.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swarmCoordinator = require('../../../../swarm_coordinator.js');
  return getApiHarnessKernel({ rootDir: process.cwd(), swarmCoordinator });
}

function ensureBridge() {
  const k: any = kernel();
  if (k._pc_envelope_bridge_attached) return;
  k._pc_envelope_bridge_attached = true;
  k.on('job', (snapshot: any) => {
    if (!snapshot) return;
    const id = snapshot.id;
    const state = String(snapshot.state || '');
    const env = envelopeBridges.get(id);
    if (!env) return;
    let terminal: string | null = null;
    let errorCode: string | null = null;
    if (state === 'completed' || state === 'done') terminal = 'answered';
    else if (state === 'failed' || state === 'blocked' || state === 'rejected') { terminal = 'failed'; errorCode = 'kernel_failed'; }
    else if (state === 'stopped' || state === 'stopping') { terminal = 'no-output'; errorCode = 'stopped'; }
    else if (state === 'waiting_approval') terminal = 'pending';
    if (terminal) {
      try {
        spine().setStatus(env, terminal, {
          errorCode,
          error: errorCode ? { message: snapshot.error || `kernel job ${state}`, hint: 'see kernel logs' } : undefined,
          artifacts: snapshot.finalReport ? { finalReport: String(snapshot.finalReport).slice(0, 2000) } : undefined,
        });
      } catch {}
      envelopeBridges.delete(id);
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') || 40);
    return NextResponse.json({ ok: true, state: 'answered', jobs: kernel().listJobs(limit) });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, state: 'failed', errorCode: 'kernel_unavailable', error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'kernel-jobs', 10);
  if (limitado) return limitado;

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch {}

  const goal = String(body?.goal || body?.task || body?.query || body?.input || '').trim();
  if (!goal) {
    return NextResponse.json({
      ok: false, state: 'failed', errorCode: 'invalid_input',
      error: { message: 'kernel/jobs requires { goal, task, or query } in body' },
    }, { status: 400 });
  }

  // Open the envelope BEFORE the kernel knows about the job — so a
  // crash during createJob still leaves a trace record.
  const sessionId = body?.sessionId || req.headers.get('x-purpclaw-session') || null;
  const env = spine().createEnvelope({
    sessionId,
    route: 'kernel',
    userText: goal,
    source: 'app-api/kernel/jobs',
  });
  spine().setStatus(env, 'pending', { provider: 'api-harness-kernel', model: body?.route || 'harness-engine' });

  try {
    ensureBridge();
    const job = kernel().createJob({ ...body, source: body?.source || 'next-api', envelopeId: env.id });
    if (job?.id) {
      spine().setStatus(env, 'pending', { jobId: job.id });
      envelopeBridges.set(job.id, env);
    }
    // terminal state depends on the route — if it was waiting_approval
    // we close as pending; otherwise delegated.
    const initial = job?.state || 'queued';
    if (initial === 'waiting_approval') {
      spine().setStatus(env, 'pending', { error: { message: `kernel waiting_approval: ${job?.approvalRequest?.id || 'unknown'}` } });
    } else if (initial === 'blocked') {
      spine().setStatus(env, 'failed', { errorCode: 'kernel_blocked', error: { message: job?.error || 'kernel blocked' } });
    }
    return NextResponse.json({
      ok: env.status === 'pending',
      state: env.status,
      job,
      envelopeId: env.id,
      errorCode: env.errorCode,
    }, { status: 202 });
  } catch (error: unknown) {
    spine().setStatus(env, 'failed', { errorCode: 'kernel_threw', error: { message: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json(
      { ok: false, state: 'failed', errorCode: 'kernel_threw', error: { message: error instanceof Error ? error.message : String(error) }, envelopeId: env.id },
      { status: 500 }
    );
  }
}
