import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function store() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/session-store.js');
}

function trace(action: string, status: string, detail: string, sessionId = '') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../lib/trace-store.js').record({ source: 'sessions-api', action, status, detail, sessionId, route: '/api/sessions' });
  } catch {}
}

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') || 80);
  const sessions = store().listSessions(Math.max(1, Math.min(limit, 200)));
  trace('list_sessions', 'ok', `${sessions.length} session(s)`);
  return NextResponse.json({ ok: true, sessions });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const model = typeof body.model === 'string' ? body.model : '';
  const title = typeof body.title === 'string' ? body.title : 'New Chat';
  const id = typeof body.id === 'string' && body.id.trim()
    ? body.id.trim()
    : store().createSession(title, provider, model).id;
  const session = store().saveSession(id, messages, { title, provider, model });
  trace('save_session', session ? 'ok' : 'error', `${messages.length} message(s)`, id);
  return NextResponse.json({ ok: !!session, session });
}
