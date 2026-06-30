import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function compactText(value: string, max = 80) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function isRealAgentName(value: string) {
  const text = String(value || '').toLowerCase();
  return Boolean(text)
    && !text.includes('fake')
    && !text.includes('nonexistent')
    && !text.includes('xyz123')
    && text !== 'unknown'
    && text.length <= 40;
}

export async function GET() {
  try {
    const scorePath = path.join(process.cwd(), 'agent_score.json');
    if (!fs.existsSync(scorePath)) {
      return NextResponse.json({
        success: true,
        meta: { totalTasksRecorded: 0, lastUpdated: new Date().toISOString() },
        agents: {},
        leaderboard: []
      });
    }

    const raw = fs.readFileSync(scorePath, 'utf8');
    const data = JSON.parse(raw);

    // Calculate score metrics similar to agent_score.js to construct leaderboard
    const agents: Record<string, any> = Object.fromEntries(
      Object.entries(data.agents || {}).filter(([name]) => isRealAgentName(name))
    );
    const leaderboard = Object.keys(agents).map(name => {
      const a = agents[name];
      const totalTasks = a.totalTasks || 0;
      const successes = a.successes || 0;
      const failures = a.failures || 0;
      const avgDuration = a.avgDuration || 0;
      const bugRate = a.bugRate || 0;
      const hackRewards = a.hackRewards || 0;

      const successRate = totalTasks > 0 ? successes / totalTasks : 0.5;
      const speedScore = Math.max(0, 100 - (avgDuration / 100));
      const bugPenalty = bugRate * 30;
      const hackBonus = Math.min(15, hackRewards * 3);

      const overall = Math.round((successRate * 50) + (speedScore * 0.5) - bugPenalty + hackBonus);
      const score = Math.max(0, Math.min(100, overall));

      return {
        agent: name,
        score,
        totalTasks,
        successes,
        failures,
        avgDuration,
        bugCount: a.bugCount || 0,
        bugRate,
        hackRewards,
        successRate: Math.round(successRate * 100),
        lastTask: a.lastTask,
        lastSuccess: a.lastSuccess
      };
    }).sort((a, b) => b.score - a.score);

    const intents = data.intents || {};
    const intentSummaries = Object.keys(intents).map(intent => {
      const row = intents[intent] || {};
      const rankedAgents = Object.entries(row.agents || {})
        .filter(([agent]) => isRealAgentName(agent))
        .map(([agent, perf]: [string, any]) => {
        const attempts = perf.attempts || 0;
        const successRate = attempts > 0 ? Math.round(((perf.successes || 0) / attempts) * 100) : 0;
        const speedScore = Math.max(0, 100 - ((perf.avgDuration || 0) / 50));
        return {
          agent,
          attempts,
          successes: perf.successes || 0,
          successRate,
          avgDuration: perf.avgDuration || 0,
          score: Math.round((successRate * 0.7) + (speedScore * 0.3))
        };
      }).sort((a, b) => b.score - a.score);

      return {
        intent: compactText(intent),
        rawIntentHash: Buffer.from(intent).toString('base64').slice(0, 16),
        totalTasks: row.totalTasks || 0,
        successes: row.successes || 0,
        failures: row.failures || 0,
        successRate: row.totalTasks > 0 ? Math.round(((row.successes || 0) / row.totalTasks) * 100) : 0,
        topAgents: rankedAgents.slice(0, 5)
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks);

    const recommendations = intentSummaries.slice(0, 12).map(intent => ({
      intent: intent.intent,
      preferredAgent: intent.topAgents[0]?.agent || null,
      alternatives: intent.topAgents.slice(1, 4).map(agent => agent.agent),
      confidence: intent.totalTasks >= 5 ? 'trained' : intent.totalTasks > 0 ? 'thin-history' : 'none',
      samples: intent.totalTasks,
    }));

    return NextResponse.json({
      success: true,
      meta: data.meta || { totalTasksRecorded: leaderboard.length },
      agentCount: Object.keys(agents).length,
      intentCount: Object.keys(intents).length,
      intentSummaries,
      recommendations,
      leaderboard
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
