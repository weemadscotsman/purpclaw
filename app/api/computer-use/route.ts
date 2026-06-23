import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';
import { projectPath } from '@/lib/runtime/project-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORT = Number(process.env.PURPCLAW_TRAY_PORT || 7796);

function token() {
  // L1 fix: projectPath() auto-detects worktree, so this works whether
  // the dev server runs from canonical or from .claude/worktrees/.../.
  return fs.readFileSync(projectPath('agent_work', '.tray-token'), 'utf8').trim();
}

async function tray(pathname: string, init?: RequestInit) {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      authorization: `Bearer ${token()}`,
    },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  const body = await response.json();
  return NextResponse.json(body, { status: response.status });
}

export async function GET() {
  try {
    return await tray('/health');
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: 'offline',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limited = checkRateLimit(req, 'computer-use', 20);
  if (limited) return limited;
  try {
    const body = await req.json();
    return await tray('/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
