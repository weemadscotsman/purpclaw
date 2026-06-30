import { NextRequest, NextResponse } from 'next/server';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function caller(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'local';
}

export function checkRateLimit(
  req: NextRequest,
  scope: string,
  maxRequests: number,
  windowMs = 60_000,
) {
  const now = Date.now();
  const key = `${scope}:${caller(req)}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;

  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count <= maxRequests) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { ok: false, error: 'rate limit exceeded', scope, retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
