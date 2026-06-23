import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../../_lib/operator-auth';
import { checkRateLimit } from '../../_lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function kernel() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getApiHarnessKernel } = require('../../../../lib/api-harness-kernel.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swarmCoordinator = require('../../../../swarm_coordinator.js');
  return getApiHarnessKernel({ rootDir: process.cwd(), swarmCoordinator });
}

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') || 40);
    return NextResponse.json({ ok: true, jobs: kernel().listJobs(limit) });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'kernel-jobs', 10);
  if (limitado) return limitado;

  try {
    const body = await req.json().catch(() => ({}));
    const job = kernel().createJob({ ...body, source: body?.source || 'next-api' });
    return NextResponse.json({ ok: true, job }, { status: 202 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
