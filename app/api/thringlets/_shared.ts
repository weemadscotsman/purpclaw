import fs from 'fs';
import path from 'path';

export const BRIDGE_PORT = Number(process.env.THRINGLET_BRIDGE_PORT || 7799);
export const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`;

export async function bridgeFetch(routePath: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BRIDGE_BASE}${routePath}`, {
    ...init,
    signal: AbortSignal.timeout(6_000),
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

export function offlineResponse(label: string, hint: string) {
  return { status: 'offline', service: label, hint };
}

function readJson(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function decayPercent(value: string | null | undefined, windowMs: number, fallback = 20) {
  if (!value) return fallback;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return fallback;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - (Date.now() - then) / windowMs))));
}

export function localMochiThringlet() {
  const mochi = readJson(path.join(process.cwd(), 'agent_work', 'mochi.json'));
  if (!mochi) return null;

  const recentPlay = decayPercent(mochi.lastPlayedAt, 2 * 3600_000, 0);
  const stats = {
    food: decayPercent(mochi.lastFedAt, 4 * 3600_000, 35),
    joy: Math.max(0, Math.min(100, Math.round((mochi.bond || 0) * 0.55 + recentPlay * 0.45))),
    clean: decayPercent(mochi.lastCleanedAt, 6 * 3600_000, 45),
    rest: decayPercent(mochi.lastSleptAt, 8 * 3600_000, 55),
    bored: Math.max(0, Math.min(100, 100 - recentPlay)),
    bond: Math.max(0, Math.min(100, Math.round(mochi.bond || Math.min(100, (mochi.interactions || 0) * 8)))),
  };
  const mood =
    stats.food < 25 ? 'hungry' :
    stats.clean < 25 ? 'dirty' :
    stats.rest < 25 ? 'tired' :
    stats.bored > 78 ? 'bored' :
    stats.joy > 70 || stats.bond > 70 ? 'happy' :
    mochi.mood || 'curious';

  return {
    id: 'mochi-primary',
    name: mochi.name || 'Mochi',
    species: mochi.species || 'companion',
    archetype: mochi.tone || 'local companion',
    rarity: mochi.rarity || 'common',
    shiny: Boolean(mochi.shiny),
    mood,
    stats,
    interactions: mochi.interactions || 0,
    bond: stats.bond,
    source: 'agent_work/mochi.json',
    updatedAt: new Date().toISOString(),
  };
}

export function localColonyMood() {
  const primary = localMochiThringlet();
  if (!primary) {
    return {
      status: 'unhatched',
      mood: 'unknown',
      count: 0,
      online: false,
      source: 'agent_work/mochi.json',
    };
  }

  return {
    status: 'online',
    mood: primary.mood,
    count: 1,
    online: true,
    dominantMood: primary.mood,
    needsAttention: ['hungry', 'dirty', 'tired', 'bored'].includes(primary.mood),
    averageBond: primary.bond,
    source: primary.source,
    updatedAt: primary.updatedAt,
  };
}
