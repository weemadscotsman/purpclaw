/**
 * /api/yo — minimal cactus greeting endpoint.
 *
 * Efficiency contract:
 *   - GET  → instant `{ yo: true, ... }` JSON (single hash + timestamp)
 *   - HEAD → same headers, zero body (cheap liveness probe)
 *   - POST → echoes back any `message` field verbatim (reciprocity, no parsing)
 *
 * No upstream probes, no DB, no LLM. Designed to answer in <1ms on a cold
 * Node runtime so it can be hammered from webhooks / cron / monitoring
 * without costing the swarm a drop of water. Lives in cactus territory.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACTUS = {
  agent: 'cactus',
  division: 'INFRASTRUCTURE',
  motto: 'do more with less',
};

function yoBody(receivedAt: number) {
  return {
    yo: true,
    agent: CACTUS.agent,
    division: CACTUS.division,
    motto: CACTUS.motto,
    at: new Date().toISOString(),
    uptimeMs: Math.max(0, Date.now() - receivedAt),
  };
}

export async function GET() {
  const receivedAt = Date.now();
  return NextResponse.json(yoBody(receivedAt), {
    headers: {
      'cache-control': 'no-store',
      'x-cactus': 'yo',
    },
  });
}

export async function HEAD() {
  // Same headers, no body. Cheapest possible liveness check.
  return new NextResponse(null, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'x-cactus': 'yo',
    },
  });
}

export async function POST(req: Request) {
  // Reciprocity: read the body once, echo any `message` field, ignore the rest.
  const receivedAt = Date.now();
  let message: unknown = null;
  try {
    const cloned = req.clone();
    const data = await cloned.json().catch(() => null);
    if (data && typeof data === 'object' && 'message' in (data as Record<string, unknown>)) {
      message = (data as Record<string, unknown>).message;
    }
  } catch {
    // body wasn't JSON or was empty — cactus doesn't complain.
  }
  return NextResponse.json(
    { ...yoBody(receivedAt), echoed: message },
    {
      headers: {
        'cache-control': 'no-store',
        'x-cactus': 'yo',
      },
    }
  );
}
