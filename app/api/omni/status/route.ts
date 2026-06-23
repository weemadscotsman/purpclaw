// OMNI-SURGEON — Phase Five: Cockpit API surface
// All three read-only routes. No write paths yet.

import { NextRequest, NextResponse } from 'next/server';
import { cachedJson } from '../../../../lib/api-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNI_DIR = require('path').join(process.cwd(), 'agent_work', 'omni');
const fs = require('fs');
const path = require('path');

function readJsonSafe(name: string) {
  try {
    const p = path.join(OMNI_DIR, name);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  // Return OMNI-SURGEON status: which artifacts exist, last update times.
  const snapshot = readJsonSafe('truth-snapshot.json');
  const registry = readJsonSafe('feature-registry.json');
  const lastPatch = readJsonSafe('last-patch-review.json');
  return cachedJson({
    ok: true,
    cycle: 'OMNI-SURGEON — Phase Five Cockpit',
        artifacts: {
      'truth-snapshot': snapshot ? { generatedAt: snapshot.generatedAt, contentHash: snapshot.contentHash, scanStats: snapshot.scanStats } : null,
      'feature-registry': registry ? { generatedAt: registry.generatedAt, stats: registry.stats } : null,
      'last-patch-review': lastPatch ? { decision: lastPatch.decision, violations: lastPatch.violations.length, requiresOperatorOverride: lastPatch.requiresOperatorOverride } : null,
    },
    doctrine: 'Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.',
  }, 'omni-status', req);
}
