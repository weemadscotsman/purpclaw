// OMNI-SURGEON — Phase Five: Cockpit API — read-only registry
import { NextRequest, NextResponse } from 'next/server';
import { cachedJson } from '../../../../lib/api-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNI_DIR = require('path').join(process.cwd(), 'agent_work', 'omni');
const fs = require('fs');
const path = require('path');

export async function GET(req: NextRequest) {
  const reg = (() => {
    try {
      const p = path.join(OMNI_DIR, 'feature-registry.json');
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { return null; }
  })();
  if (!reg) return NextResponse.json({ ok: false, error: 'feature-registry.json not found; run lib/omni/feature-registry.js first' }, { status: 404 });
  return cachedJson({ ok: true, generatedAt: reg.generatedAt, stats: reg.stats, features: reg.features }, 'omni-registry', req);
}
