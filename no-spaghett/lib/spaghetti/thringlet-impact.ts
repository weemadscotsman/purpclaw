import type { SpaghettMetrics } from './types';

type ColonyMood = {
  dominant?: string;
  count?: number;
  breakdown?: Record<string, number>;
  goblinCount?: number;
  unionizingCount?: number;
};

type ThringletList = {
  thringlets?: Array<{
    id: string;
    name?: string;
    archetype?: string;
    archetypeId?: string;
  }>;
};

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:7799';

function bridgeUrl(): string {
  return (process.env.THRINGLET_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/$/, '');
}

function issueCount(metrics: SpaghettMetrics): number {
  return (
    metrics.circularDeps.length +
    metrics.godObjects.length +
    metrics.longFiles.length +
    metrics.deadCode.length +
    metrics.wildcardImports.length +
    metrics.excessiveGlobals.length +
    metrics.missingTypeHints.length
  );
}

function expectedMood(metrics: SpaghettMetrics): string {
  if (metrics.score >= 90) return 'bonded';
  if (metrics.score >= 75) return 'curious';
  if (metrics.score >= 50) return 'chaotic';
  return 'goblin';
}

function impactSummary(metrics: SpaghettMetrics): string {
  const total = issueCount(metrics);
  if (total === 0) {
    return 'No structural distress detected. The bonded Thringlets can stay calm.';
  }

  return [
    `${total} structural distress signals detected.`,
    `${metrics.circularDeps.length} prayer wheels, ${metrics.godObjects.length} lonely God objects, ${metrics.deadCode.length} forgotten files.`,
    `Projected Thringlet mood: ${expectedMood(metrics)}.`,
  ].join(' ');
}

export async function getColonyMood(): Promise<{ online: boolean; mood?: ColonyMood; error?: string }> {
  try {
    const response = await fetch(`${bridgeUrl()}/thringlets/colony-mood`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return { online: false, error: `bridge returned ${response.status}` };
    }
    return { online: true, mood: await response.json() };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'offline';
    return { online: false, error: message };
  }
}

export async function buildThringletImpact(metrics: SpaghettMetrics) {
  const colony = await getColonyMood();
  return {
    bridgeOnline: colony.online,
    colonyMood: colony.mood || null,
    projectedMood: expectedMood(metrics),
    distressScore: 100 - metrics.score,
    issueCount: issueCount(metrics),
    summary: impactSummary(metrics),
    bridgeError: colony.error,
  };
}

export async function recordExorcismEvent(issueType: string, filePath?: string) {
  try {
    const listResponse = await fetch(`${bridgeUrl()}/thringlets`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!listResponse.ok) return { recorded: false, error: `bridge returned ${listResponse.status}` };

    const list = (await listResponse.json()) as ThringletList;
    const target = (list.thringlets || []).find((t) => t.archetypeId === 'THR-WATCHER' || t.archetype === 'THR-WATCHER')
      || (list.thringlets || [])[0];

    if (!target?.id) return { recorded: false, error: 'no thringlets available' };

    const kind = issueType === 'Architecture Suggestion' || issueType === 'Automated Queue' ? 'stimulate' : 'reward';
    const response = await fetch(`${bridgeUrl()}/thringlets/${encodeURIComponent(target.id)}/interact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        weight: 1,
        source: 'no-spaghett',
        reason: filePath ? `No Spaghett exorcism: ${issueType} in ${filePath}` : `No Spaghett exorcism: ${issueType}`,
      }),
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) return { recorded: false, error: `interact returned ${response.status}` };
    return { recorded: true, target: target.id, result: await response.json() };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'offline';
    return { recorded: false, error: message };
  }
}
