import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function store() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/session-repository.js');
}

function trace(action: string, status: string, detail: string, sessionId = '') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../lib/trace-store.js').record({ source: 'sessions-api', action, status, detail, sessionId, route: '/api/sessions' });
  } catch {}
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get('id') || '').trim();
  if (id) {
    const session = store().loadSession(id);
    trace('load_session', session ? 'ok' : 'missing', session ? `${session.messageCount} message(s)` : 'not found', id);
    if (!session) return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, session });
  }
  const limit = Number(req.nextUrl.searchParams.get('limit') || 80);
  const sessions = store().listSessions(Math.max(1, Math.min(limit, 200)));
  trace('list_sessions', 'ok', `${sessions.length} session(s)`);
  return NextResponse.json({ ok: true, sessions });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const model = typeof body.model === 'string' ? body.model : '';
  const title = typeof body.title === 'string' ? body.title : 'New Chat';
  const requestedId = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '';
  let session = requestedId ? store().loadSession(requestedId) : null;
  if (!session) {
    session = store().createSession(title, provider, model, {
      ...(requestedId ? { id: requestedId } : {}),
      source: 'web',
    });
  }
  if (Array.isArray(body.messages)) {
    session = store().saveSession(session.id, body.messages, {
      title,
      provider,
      model,
      source: session.source || 'web',
    });
  }
  trace(
    Array.isArray(body.messages) ? 'save_session' : 'create_session',
    session ? 'ok' : 'error',
    `${session?.messageCount || 0} message(s)`,
    session.id
  );
  return NextResponse.json({ ok: !!session, session });
}
