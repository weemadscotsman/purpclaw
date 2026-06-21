import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ServiceRow = {
  key: string;
  name: string;
  pm2: string;
  group: string;
  port: number | null;
  healthPort?: number | null;
  healthPath?: string | null;
  required?: boolean;
  note?: string;
};

function publicClass(service: ServiceRow) {
  if (service.group === 'core') return 'core';
  return service.required ? 'core' : 'optional-dark';
}

async function probe(service: ServiceRow) {
  const healthPort = service.healthPort ?? service.port;
  const healthPath = service.healthPath || null;
  const base = {
    id: service.key,
    key: service.key,
    name: service.name,
    pm2: service.pm2,
    group: service.group,
    class: publicClass(service),
    required: Boolean(service.required),
    port: service.port,
    healthPort,
    healthPath,
    note: service.note || null,
  };

  if (!healthPort || !healthPath) {
    return {
      ...base,
      ok: false,
      status: 'no-health-endpoint',
      url: null,
      error: 'service has no HTTP health endpoint; verify with PM2/events',
    };
  }

  const url = `http://127.0.0.1:${healthPort}${healthPath}`;
  try {
    const started = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(1800) });
    return {
      ...base,
      // A service that ANSWERS is up. res.ok (2xx-only) marked services down
      // when they served health on a different path (404) or redirected (3xx)
      // — that produced a fake "1/22 services, 21 alerts". Only a connection
      // error/timeout (the catch below) or a 5xx means not-serving.
      ok: typeof res.status === 'number' && res.status > 0 && res.status < 500,
      status: res.status,
      latencyMs: Date.now() - started,
      url,
    };
  } catch (error: any) {
    return {
      ...base,
      ok: false,
      status: 'offline',
      url,
      error: error?.name === 'TimeoutError' ? 'timeout' : (error?.message || 'offline'),
    };
  }
}

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const registry = require('../../../service_registry.js');
    const rows: ServiceRow[] = Array.isArray(registry.SERVICES) ? registry.SERVICES : [];
    const services = await Promise.all(rows.map(probe));
    const up = services.filter(service => service.ok).length;
    const groups = Object.fromEntries(
      [...new Set(services.map(service => service.group || 'unknown'))].map(group => {
        const members = services.filter(service => service.group === group);
        return [group, {
          healthy: members.filter(service => service.ok).length,
          total: members.length,
        }];
      })
    );

    return NextResponse.json({
      ok: true,
      source: 'service_registry.js',
      up,
      total: services.length,
      groups,
      services,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
