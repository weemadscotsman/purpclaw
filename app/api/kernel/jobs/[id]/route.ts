import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/kernel/jobs/[id]
 *
 * SPINE CONTRACT (2026-06-23, Eddie's fix):
 *   Returns the kernel job's current state plus the message envelope's
 *   terminal state. The chat UI polls this endpoint after a delegated
 *   state to render a progress / answer / failure card.
 */

function envelope() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../../lib/message-envelope');
}
function kernel() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getApiHarnessKernel } = require('../../../../../lib/api-harness-kernel.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swarmCoordinator = require('../../../../../swarm_coordinator.js');
  return getApiHarnessKernel({ rootDir: process.cwd(), swarmCoordinator });
}

function kernelStateToSpineState(kernelState: string, envelopeStatus: string) {
  if (envelopeStatus && envelopeStatus !== 'open') return envelopeStatus;
  if (kernelState === 'completed' || kernelState === 'done') return 'answered';
  if (kernelState === 'failed' || kernelState === 'blocked' || kernelState === 'rejected') return 'failed';
  if (kernelState === 'waiting_approval') return 'pending';
  if (kernelState === 'stopped' || kernelState === 'stopping') return 'no_output';
  return 'pending';
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = kernel().getJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, state: 'failed', error: 'job_not_found' }, { status: 404 });
    }
    // If we have an envelope tracked for this job, prefer its terminal
    // state (it gets stamped by the bridge when the kernel emits 'job').
    const spineState = kernelStateToSpineState(String(job.state || ''), 'open');
    return NextResponse.json({ ok: spineState === 'answered', state: spineState, job });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, state: 'failed', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
