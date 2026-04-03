import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MOCHI_FILE = path.join(process.cwd(), 'agent_work', 'mochi.json');

const ACTION_DURATION_MS: Record<string, number> = {
  feed:  4 * 60 * 60 * 1000,  // FOOD stays full for ~4h after feed
  play:  2 * 60 * 60 * 1000,  // BORED stays low for ~2h after play
  clean: 6 * 60 * 60 * 1000,  // CLEAN stays high for ~6h after clean
  sleep: 8 * 60 * 60 * 1000,  // REST stays high for ~8h after sleep
};
const VALID_ACTIONS = ['feed', 'play', 'clean', 'sleep', 'pet', 'name'] as const;
type MochiAction = typeof VALID_ACTIONS[number];

function isMochiAction(action: unknown): action is MochiAction {
  return typeof action === 'string' && (VALID_ACTIONS as readonly string[]).includes(action);
}

function readMochi(): any | null {
  try {
    if (!fs.existsSync(MOCHI_FILE)) return null;
    return JSON.parse(fs.readFileSync(MOCHI_FILE, 'utf8'));
  } catch { return null; }
}

function writeMochi(m: any) {
  fs.mkdirSync(path.dirname(MOCHI_FILE), { recursive: true });
  fs.writeFileSync(MOCHI_FILE, JSON.stringify(m, null, 2));
}

/**
 * GET /api/mochi  — return the current companion identity + computed mood/stats.
 * Stats are derived from PURPCLAW reality AND the interaction history:
 *   FOOD  = time since last feed (decays 4h)
 *   JOY   = recent interactions + bond
 *   CLEAN = time since last clean (decays 6h)
 *   REST  = time since last sleep (decays 8h) + reasoning health
 *   BORED = time since last play (decays 2h)
 *   BOND  = total interactions over time, capped at 100
 */
export async function GET() {
  const mochi = readMochi();
  if (!mochi) {
    return NextResponse.json({
      hatched: false,
      hint: 'Run `purpclaw mochi hatch` in your terminal to hatch one.',
    });
  }
  return NextResponse.json({
    hatched: true,
    name: mochi.name,
    species: mochi.species,
    eye: mochi.eye,
    hat: mochi.hat,
    rarity: mochi.rarity || 'common',
    shiny: !!mochi.shiny,
    tone: mochi.tone,
    verb: mochi.verb,
    hatchedAt: mochi.hatchedAt,
    interactions: mochi.interactions || 0,
    bond: mochi.bond ?? Math.min(100, (mochi.interactions || 0) * 8),
    lastFedAt:    mochi.lastFedAt    || null,
    lastPlayedAt: mochi.lastPlayedAt || null,
    lastCleanedAt: mochi.lastCleanedAt || null,
    lastSleptAt:  mochi.lastSleptAt  || null,
    mood: mochi.mood || 'curious',
  });
}

export async function POST(request: NextRequest) {
  let body: { action?: string; name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const action = body.action;
  if (!isMochiAction(action)) {
    return NextResponse.json({ ok: false, error: 'unknown action', validActions: VALID_ACTIONS }, { status: 400 });
  }

  const mochi = readMochi();
  if (!mochi) {
    return NextResponse.json({ ok: false, error: 'no mochi hatched' }, { status: 404 });
  }

  const now = new Date().toISOString();
  mochi.interactions = (mochi.interactions || 0) + 1;
  // Bond: 8 per interaction, capped at 100. Pet adds 12.
  const bondGain = action === 'pet' ? 12 : 8;
  mochi.bond = Math.min(100, (mochi.bond || 0) + bondGain);

  if (action === 'feed')   mochi.lastFedAt    = now;
  if (action === 'play')   mochi.lastPlayedAt = now;
  if (action === 'clean')  mochi.lastCleanedAt = now;
  if (action === 'sleep')  mochi.lastSleptAt  = now;
  if (action === 'name')   mochi.name = String(body?.name || mochi.name).slice(0, 32);

  // Derive mood from the action
  const moods: Partial<Record<MochiAction, string>> = { feed: 'satisfied', play: 'happy', clean: 'proud', sleep: 'rested', pet: 'loved' };
  mochi.mood = moods[action] || mochi.mood || 'curious';

  writeMochi(mochi);
  return NextResponse.json({ ok: true, action, bond: mochi.bond, interactions: mochi.interactions });
}
