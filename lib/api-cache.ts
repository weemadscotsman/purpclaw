// lib/api-cache.ts
// OMNI cockpit cache layer. The /api/omni/* routes are polled every
// 5s by the cockpit. Most OMNI artifacts (truth-snapshot, registry,
// patch review) only change every few minutes. Adding ETag + Cache-Control
// lets the browser skip re-downloading the same body.
//
// Result: ~99% bandwidth reduction on repeat polls, and the cockpit
// sees no UI lag because the response is `304 Not Modified` from the
// browser cache.

import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export type CacheProfile = 'omni-status' | 'omni-registry' | 'omni-scan' | 'omni-patch' | 'omni-providers';

const PROFILES: Record<CacheProfile, { maxAge: number; stale: number; vary: string }> = {
  // Status flips at most every time a write happens; 5s matches the poll
  // interval, plus 30s SWR for the user opening the tab a moment later.
  'omni-status':   { maxAge: 5,  stale: 30, vary: 'accept-encoding' },
  // Registry changes only on `lib/omni/feature-registry.js` run; 30s is fine.
  'omni-registry': { maxAge: 30, stale: 60, vary: 'accept-encoding' },
  // Scan is the truth snapshot; only changes on `lib/omni/truth-scanner.js`.
  // 60s default, 5min SWR.
  'omni-scan':     { maxAge: 60, stale: 300, vary: 'accept-encoding' },
  // Patch review is a write-once artifact; 5min default, 30min SWR.
  'omni-patch':    { maxAge: 300, stale: 1800, vary: 'accept-encoding' },
  // Provider integrity; refreshes on long-running probe cycles; 5s matches poll.
  'omni-providers':{ maxAge: 5,  stale: 30, vary: 'accept-encoding' },
};

function weakETag(body: string): string {
  return '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
}

/**
 * Wrap a JSON-serialisable payload with ETag + Cache-Control headers.
 * Honors `If-None-Match`: returns 304 Not Modified if the body is
 * unchanged, which the browser will swap for a 200 in its cache.
 *
 * `generatedAt` is separate from the payload body — we strip it from
 * the ETag calculation so two consecutive requests with the same
 * underlying data hash to the same ETag and the browser can 304.
 */
export function cachedJson(payload: any, profile: CacheProfile, req?: NextRequest, generatedAt?: string): NextResponse {
  // Pull `generatedAt` out of the body for the ETag — it's the only
  // field that changes per-request and would prevent 304s.
  const { generatedAt: payloadGeneratedAt, ...bodyForEtag } = (payload && typeof payload === 'object') ? payload : { _: payload };
  void payloadGeneratedAt;
  const etagSource = JSON.stringify(bodyForEtag);
  const etag = weakETag(etagSource);
  const fullBody = { ...payload };
  if (generatedAt) fullBody.generatedAt = generatedAt;
  const p = PROFILES[profile];
  if (req) {
    const inm = req.headers.get('if-none-match');
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'etag': etag,
          'cache-control': `private, max-age=${p.maxAge}, stale-while-revalidate=${p.stale}`,
          'vary': p.vary,
        },
      }) as any;
    }
  }
  return NextResponse.json(fullBody, {
    headers: {
      'etag': etag,
      'cache-control': `private, max-age=${p.maxAge}, stale-while-revalidate=${p.stale}`,
      'vary': p.vary,
      'x-omni-cached': '1',
    },
  });
}
