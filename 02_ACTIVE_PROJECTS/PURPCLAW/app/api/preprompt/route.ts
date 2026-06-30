import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../_lib/operator-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The pre-prompt compiler (command-law layer) control surface.
//   GET  /api/preprompt           → live status + available profiles
//   GET  /api/preprompt?preview=build → compiled prefix for a profile (no audit)
//   POST /api/preprompt { profile } → switch active profile (operator-gated)
//   POST /api/preprompt { enabled } → enable/disable the compiler (operator-gated)
//
// Read is open (status is not sensitive). Mutations require operator auth —
// gated, not gutted: switching the operating profile is a real action.

// eslint-disable-next-line @typescript-eslint/no-var-requires
function compiler() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/runtime/preprompt-compiler');
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
function settings() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/runtime/settings-registry');
}

export async function GET(req: NextRequest) {
  try {
    const pc = compiler();
    const preview = req.nextUrl.searchParams.get('preview');
    if (preview) {
      const compiled = pc.compile({ profile: preview, source: 'preview', silent: true });
      return NextResponse.json({ ok: true, preview: compiled });
    }
    return NextResponse.json({ ...pc.status(), profileDefs: pc.listProfiles() });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = checkOperator(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });

    const pc = compiler();
    const reg = settings();
    const results: Record<string, unknown> = {};

    if (body.profile !== undefined) {
      if (!pc.profileNames().includes(body.profile)) {
        return NextResponse.json({ ok: false, error: `unknown profile: ${body.profile}`, profiles: pc.profileNames() }, { status: 400 });
      }
      results.profile = reg.set('preprompt.activeProfile', body.profile);
    }
    if (body.enabled !== undefined) {
      results.enabled = reg.set('preprompt.enabled', !!body.enabled);
    }
    if (Object.keys(results).length === 0) {
      return NextResponse.json({ ok: false, error: 'provide { profile } and/or { enabled }' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, results, status: pc.status() });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
