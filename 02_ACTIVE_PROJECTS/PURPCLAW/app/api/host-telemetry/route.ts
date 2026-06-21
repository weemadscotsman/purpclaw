import { NextResponse } from 'next/server';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Real host telemetry for the cockpit footer (was hard N/A — nothing fed it).
// System-wide CPU% via a short idle/total sample, RAM% from os mem, and the
// Next process RSS. No fabrication: if a value can't be computed it's null and
// the footer shows N/A honestly.
function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const t of Object.values(c.times)) total += t;
    idle += c.times.idle;
  }
  return { idle, total };
}

export async function GET() {
  try {
    const a = cpuSnapshot();
    await new Promise((r) => setTimeout(r, 120));
    const b = cpuSnapshot();
    const idleDiff = b.idle - a.idle;
    const totalDiff = b.total - a.total;
    const cpuPct = totalDiff > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100))) : null;

    const total = os.totalmem();
    const ramPct = total > 0 ? Math.round((1 - os.freemem() / total) * 100) : null;
    const processRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    return NextResponse.json({
      cpuPct,
      ramPct,
      processRssMb,
      platform: os.platform(),
      cores: os.cpus().length,
      loadAvg1: os.loadavg()[0] || null,
      sampledAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { cpuPct: null, ramPct: null, processRssMb: 0, platform: os.platform(), error: e instanceof Error ? e.message : String(e), sampledAt: new Date().toISOString() },
      { status: 200 },
    );
  }
}
