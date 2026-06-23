import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApiHarnessKernel } = require('../../../../../lib/api-harness-kernel.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const swarmCoordinator = require('../../../../../swarm_coordinator.js');
    const job = getApiHarnessKernel({ rootDir: process.cwd(), swarmCoordinator }).getJob(id);
    if (!job) return NextResponse.json({ ok: false, error: 'job_not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, job });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
