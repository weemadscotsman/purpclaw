import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';
// L1 fix: projectPath() detects worktree, so the voice-command route
// reads the canonical .tray-token regardless of dev-server cwd.
import { projectPath } from '@/lib/runtime/project-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORT = Number(process.env.PURPCLAW_TRAY_PORT || 7796);

function token() {
  return fs.readFileSync(projectPath('agent_work', '.tray-token'), 'utf8').trim();
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limited = checkRateLimit(req, 'voice-command', 30);
  if (limited) return limited;
  try {
    const body = await req.json();
    const response = await fetch(`http://127.0.0.1:${PORT}/voice`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
      cache: 'no-store',
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}
