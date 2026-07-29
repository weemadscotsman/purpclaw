import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function store() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../../lib/session-repository.js');
}

function trace(action: string, status: string, detail: string, sessionId: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../../lib/trace-store.js').record({ source: 'sessions-api', action, status, detail, sessionId, route: `/api/sessions/${sessionId}` });
  } catch {}
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = store().loadSession(id);
  trace('load_session', session ? 'ok' : 'missing', session ? `${session.messageCount || session.messages?.length || 0} message(s)` : 'not found', id);
  if (!session) return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, session });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ ok: false, error: 'missing_title' }, { status: 400 });
  const session = store().renameSession(id, title);
  trace('rename_session', session ? 'ok' : 'missing', title, id);
  if (!session) return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, session });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = store().deleteSession(id);
  trace('delete_session', 'ok', 'deleted', id);
  return NextResponse.json({ ok: true, ...result });
}
