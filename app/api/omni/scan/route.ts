// OMNI-SURGEON — Phase Five: Cockpit API — read-only scan status
import { NextRequest, NextResponse } from 'next/server';
import { cachedJson } from '../../../../lib/api-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNI_DIR = require('path').join(process.cwd(), 'agent_work', 'omni');
const fs = require('fs');
const path = require('path');

export async function GET(req: NextRequest) {
  const snap = (() => {
    try {
      const p = path.join(OMNI_DIR, 'truth-snapshot.json');
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { return null; }
  })();
  if (!snap) return NextResponse.json({ ok: false, error: 'truth-snapshot.json not found; run lib/omni/truth-scanner.js first' }, { status: 404 });
  return cachedJson({
    ok: true,
    generatedAt: snap.generatedAt,
    contentHash: snap.contentHash,
    scanStats: snap.scanStats,
    routeCount: snap.routes?.length || 0,
    serviceCount: snap.services?.length || 0,
    featureCount: snap.features?.length || 0,
  }, 'omni-scan', req);
}
