import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../../_lib/operator-auth';
import { checkRateLimit } from '../../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function loadGovernance() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/governance.js');
}

export async function GET() {
  try {
    const governance = loadGovernance();
    return NextResponse.json({ ok: true, policy: governance.readPolicy(process.cwd()) });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = checkOperator(request);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(request, 'governance-policy', 10);
  if (limitado) return limitado;

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode;
    if (mode !== 'supervised' && mode !== 'autonomous') {
      return NextResponse.json({ ok: false, error: 'mode must be supervised or autonomous' }, { status: 400 });
    }
    const governance = loadGovernance();
    const current = governance.readPolicy(process.cwd());
    const policy = { ...current, mode };
    governance.writePolicy(process.cwd(), policy);
    return NextResponse.json({ ok: true, policy });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
