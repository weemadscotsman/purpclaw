import { NextRequest, NextResponse } from 'next/server';

/**
 * Operator auth + CSRF guard for state-changing API routes.
 *
 * Ship posture (B3/B4/B5):
 *  - If PURPCLAW_OPERATOR_TOKEN is set, every mutating request MUST carry it
 *    in `authorization: Bearer <token>` or `x-operator-token: <token>`.
 *  - CSRF: a cross-site Origin is always rejected, token or not. Same-origin
 *    and tool/no-Origin requests (curl, server-to-server) are allowed to
 *    proceed to the token check.
 *  - If no token is configured (local dev), same-origin mutations are allowed
 *    but the response is flagged so the UI can warn the operator to set one
 *    before exposing the stack on a network.
 *
 * This is intentionally simple and dependency-free so it can ship today. It is
 * NOT a substitute for binding the Next server to 127.0.0.1, which remains the
 * primary network boundary.
 */

function configuredToken(): string | null {
  const t = process.env.PURPCLAW_OPERATOR_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

function presentedToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer || req.headers.get('x-operator-token') || null;
}

function isCrossSite(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false; // no Origin → not a browser cross-site POST (curl, SSR)
  try {
    return new URL(origin).host !== req.headers.get('host');
  } catch {
    return true; // unparseable Origin → treat as hostile
  }
}

export type OperatorCheck =
  | { ok: true; mode: 'token' | 'dev-no-token' }
  | { ok: false; response: NextResponse };

export function checkOperator(req: NextRequest): OperatorCheck {
  if (isCrossSite(req)) {
    return { ok: false, response: NextResponse.json(
      { ok: false, error: 'cross-site request rejected (CSRF)' }, { status: 403 }) };
  }
  const want = configuredToken();
  if (want) {
    const got = presentedToken(req);
    if (!got || got !== want) {
      return { ok: false, response: NextResponse.json(
        { ok: false, error: 'operator token required' }, { status: 401 }) };
    }
    return { ok: true, mode: 'token' };
  }
  return { ok: true, mode: 'dev-no-token' };
}
