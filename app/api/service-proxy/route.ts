import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_PORTS = new Set([3000, 3030, 5000, 7777, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7790, 7791, 7792, 7797, 7798, 7799, 7880, 7881, 7884, 7885, 7890, 7892, 7895, 7896, 7897, 7898, 7788, 8781]);

function trace(action: string, status: string, detail: string, extra: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../lib/trace-store.js').record({ source: 'service-proxy', route: '/api/service-proxy', action, status, detail, ...extra });
  } catch {}
}

type Target =
  | { url: string; port: number; path: string }
  | { error: string };

function getTarget(request: NextRequest): Target {
  const port = Number(request.nextUrl.searchParams.get('port'));
  const path = request.nextUrl.searchParams.get('path') || '/health';

  if (!Number.isInteger(port) || !ALLOWED_PORTS.has(port)) {
    return { error: 'port-not-allowed' };
  }

  if (!path.startsWith('/') || path.includes('://') || path.includes('..')) {
    return { error: 'path-not-allowed' };
  }

  return { url: `http://127.0.0.1:${port}${path}`, port, path };
}

async function proxy(request: NextRequest) {
  const target = getTarget(request);
  const soft = request.nextUrl.searchParams.get('soft') === '1';
  if (!('url' in target)) {
    trace('proxy_rejected', 'error', target.error);
    return NextResponse.json({ status: 'disabled', error: target.error }, { status: soft ? 200 : 400 });
  }

  try {
    const init: RequestInit = {
      method: request.method,
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
      },
      signal: AbortSignal.timeout(2000),
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text();
    }

    const upstream = await fetch(target.url, init);
    const contentType = upstream.headers.get('content-type') || '';
    const text = await upstream.text();
    let body: unknown = text;
    if (contentType.includes('application/json')) {
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    }

    trace('proxy_fetch', upstream.ok ? 'ok' : 'error', `${request.method} :${target.port}${target.path} -> ${upstream.status}`, { upstreamStatus: upstream.status });
    return NextResponse.json(
      {
        status: upstream.ok ? 'online' : 'offline',
        upstreamStatus: upstream.status,
        target: { port: target.port, path: target.path },
        data: body,
      },
      { status: upstream.ok || soft ? 200 : 502 }
    );
  } catch (error: any) {
    trace('proxy_failed', 'error', `${request.method} :${target.port}${target.path} -> ${error?.message || 'offline'}`);
    return NextResponse.json(
      {
        status: 'disabled',
        error: error?.name === 'TimeoutError' ? 'timeout' : 'offline-or-config-needed',
        target: { port: target.port, path: target.path },
      },
      { status: soft ? 200 : 503 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxy(request);
}

export async function POST(request: NextRequest) {
  return proxy(request);
}

export async function PATCH(request: NextRequest) {
  return proxy(request);
}

export async function DELETE(request: NextRequest) {
  return proxy(request);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
