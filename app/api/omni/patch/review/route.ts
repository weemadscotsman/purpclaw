// OMNI-SURGEON — Phase Five: Cockpit API — read-only patch review status
import { NextRequest, NextResponse } from 'next/server';
import { cachedJson } from '../../../../../lib/api-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNI_DIR = require('path').join(process.cwd(), 'agent_work', 'omni');
const fs = require('fs');
const path = require('path');

export async function GET(req: NextRequest) {
  const review = (() => {
    try {
      const p = path.join(OMNI_DIR, 'last-patch-review.json');
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { return null; }
  })();
  if (!review) return NextResponse.json({ ok: false, error: 'no patch review yet; run lib/omni/patch-governor.js first' }, { status: 404 });
  return cachedJson(review, 'omni-patch', req);
}
