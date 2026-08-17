/**
 * PURPCLAW AGENT SCORE v1.0
 * ==========================
 * Tracks agent performance metrics to enable smarter routing.
 *
 * "You built a society. You need a machine." - Compound Monster
 *
 * This system gives the swarm MEMORY of which agents are fast,
 * which cause bugs, which excel at certain task types.
 *
 * Features:
 * - Per-agent task counts, success rates, average durations
 * - Per-intent agent rankings (who's best at "fix"? "build"?)
 * - Bug tracking (agents that often produce buggy code)
 * - Persistent storage to agent_score.json
 */

const fs = require('fs');
const path = require('path');

const PURP_DIR = path.join(__dirname);
const SCORE_FILE = path.join(PURP_DIR, 'agent_score.json');

// ========== SCORE DATA STRUCTURE ==========

const DEFAULT_SCORES = {
  agents: {},        // Per-agent metrics
  intents: {},        // Per-intent performance
  history: [],        // Recent task history (last 500)
  meta: {
    version: '1.0',
    lastUpdated: null,
    totalTasksRecorded: 0
  }
};

let scores = loadScores();

// ========== PERSISTENCE ==========

function loadScores() {
  try {
    if (fs.existsSync(SCORE_FILE)) {
      const data = fs.readFileSync(SCORE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      console.log(`[SCORE] Loaded ${parsed.meta?.totalTasksRecorded || 0} historical tasks`);
      return parsed;
    }
  } catch (e) {
    console.log(`[SCORE] No existing score file, starting fresh`);
  }
  return { ...DEFAULT_SCORES };
}

function saveScores() {
  scores.meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
}

// ========== RECORDING ==========

/**
 * Record a task outcome for an agent
 * @param {string} agentName - Agent identifier (e.g., 'robot', 'dragon')
 * @param {string} intent - Task type (e.g., 'fix', 'build', 'audit')
 * @param {boolean} success - Whether task succeeded
 * @param {number} duration - Time taken in ms
 * @param {object} extras - Optional: { bugIntroduced: bool, linesChanged: num }
 */
function recordTask(agentName, intent, success, duration, extras = {}) {
  const agent = agentName.toLowerCase();
  const timestamp = new Date().toISOString();

  // Initialize if needed
  if (!scores.agents[agent]) {
    scores.agents[agent] = {
      totalTasks: 0,
      successes: 0,
      failures: 0,
      totalDuration: 0,
      avgDuration: 0,
      bugCount: 0,           // Tasks that introduced bugs
      bugRate: 0,             // bugCount / totalTasks
      lastTask: null,
      lastSuccess: null,
      intentScores: {}        // Per-intent performance
    };
  }

  if (!scores.intents[intent]) {
    scores.intents[intent] = {
      totalTasks: 0,
      successes: 0,
      failures: 0,
      agents: {}              // Which agents handled this intent
    };
  }

  // Update agent metrics
  const a = scores.agents[agent];
  a.totalTasks++;
  a.totalDuration += duration;
  a.avgDuration = Math.round(a.totalDuration / a.totalTasks);
  a.lastTask = timestamp;

  if (success) {
    a.successes++;
    a.lastSuccess = timestamp;
  } else {
    a.failures++;
  }

  // Track bugs
  if (extras.bugIntroduced) {
    a.bugCount++;
    a.bugRate = a.bugCount / a.totalTasks;
  }

  // Update intent metrics
  const i = scores.intents[intent];
  i.totalTasks++;
  if (success) i.successes++;
  else i.failures++;

  // Track agent's performance on this specific intent
  if (!i.agents[agent]) {
    i.agents[agent] = { attempts: 0, successes: 0, avgDuration: 0, totalDuration: 0 };
  }
  const ia = i.agents[agent];
  ia.attempts++;
  ia.totalDuration += duration;
  ia.avgDuration = Math.round(ia.totalDuration / ia.attempts);
  if (success) ia.successes++;

  // Add to history
  scores.history.push({
    agent,
    intent,
    success,
    duration,
    bugIntroduced: extras.bugIntroduced || false,
    timestamp
  });

  // Trim history to last 500
  if (scores.history.length > 500) {
    scores.history = scores.history.slice(-500);
  }

  scores.meta.totalTasksRecorded++;
  saveScores();

  console.log(`[SCORE] ${agent} ${intent}: ${success ? '✓' : '✗'} ${duration}ms${extras.bugIntroduced ? ' (BUG)' : ''}`);
}

/**
 * Mark that an agent's work was subsequently found to have a bug
 * Call this when another agent discovers bugs in previous work
 */
function markBugIntroducedBy(agentName, intent) {
  recordTask(agentName, intent, false, 0, { bugIntroduced: true });
}

// ========== QUERYING ==========

/**
 * Get overall score for an agent (0-100)
 * Factors: success rate, speed, bug rate
 */
function getAgentScore(agentName) {
  const a = scores.agents[agentName.toLowerCase()];
  if (!a || a.totalTasks === 0) return 50; // Default neutral score

  const successRate = a.totalTasks > 0 ? a.successes / a.totalTasks : 0.5;
  const speedScore = Math.max(0, 100 - (a.avgDuration / 100)); // Faster = higher
  const bugPenalty = a.bugRate * 30; // Up to 30 point penalty for bugs

  const overall = Math.round((successRate * 50) + (speedScore * 0.5) - bugPenalty);
  return Math.max(0, Math.min(100, overall));
}

/**
 * Get detailed agent stats
 */
function getAgentStats(agentName) {
  const a = scores.agents[agentName.toLowerCase()];
  if (!a) {
    return { totalTasks: 0, score: 50, status: 'unknown' };
  }

  return {
    ...a,
    score: getAgentScore(agentName),
    successRate: a.totalTasks > 0 ? Math.round((a.successes / a.totalTasks) * 100) : 0,
    recentHistory: scores.history.filter(h => h.agent === agentName.toLowerCase()).slice(-10)
  };
}

/**
 * Get best agents for a specific intent, sorted by performance
 */
function getAgentsForIntent(intent, limit = 5) {
  const i = scores.intents[intent];
  if (!i || !i.agents) {
    return []; // No data, let orchestrator decide
  }

  // Calculate score per agent for this intent
  const ranked = Object.entries(i.agents)
    .map(([agent, data]) => {
      const successRate = data.attempts > 0 ? data.successes / data.attempts : 0;
      const speedScore = Math.max(0, 100 - (data.avgDuration / 50));
      return {
        agent,
        attempts: data.attempts,
        successes: data.successes,
        successRate: Math.round(successRate * 100),
        avgDuration: data.avgDuration,
        score: Math.round((successRate * 70) + (speedScore * 0.3))
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}

/**
 * Get agent that's least likely to cause problems (high score, low bug rate)
 */
function getSafestAgent(intent) {
  const candidates = getAgentsForIntent(intent, 10);
  // Prefer agents with lower bug rates among high scorers
  const safe = candidates
    .filter(a => {
      const stats = scores.agents[a.agent];
      return !stats || stats.bugRate < 0.2; // Less than 20% bug rate
    })
    .sort((a, b) => b.score - a.score);

  return safe[0]?.agent || candidates[0]?.agent || null;
}

/**
 * Get fastest agent for an intent (ignores quality)
 */
function getFastestAgent(intent) {
  const candidates = getAgentsForIntent(intent, 10);
  return candidates
    .sort((a, b) => a.avgDuration - b.avgDuration)[0]?.agent || null;
}

/**
 * Get league table of all agents by score
 */
function getAgentLeaderboard() {
  return Object.keys(scores.agents)
    .map(agent => ({
      agent,
      score: getAgentScore(agent),
      ...scores.agents[agent]
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get intent statistics
 */
function getIntentStats(intent) {
  const i = scores.intents[intent];
  if (!i) return { totalTasks: 0, successRate: 0, topAgents: [] };

  return {
    totalTasks: i.totalTasks,
    successes: i.successes,
    failures: i.failures,
    successRate: i.totalTasks > 0 ? Math.round((i.successes / i.totalTasks) * 100) : 0,
    topAgents: getAgentsForIntent(intent, 3)
  };
}

// ========== ORCHESTRATOR INTEGRATION ==========

/**
 * Called by orchestrator after task completion
 * Hook this into orchestrator's completeWorkflow and failWorkflow
 */
function onWorkflowComplete(workflow) {
  const agent = workflow.agentId?.split('-')[0] || 'unknown';
  const intent = workflow.parsed?.intent || 'general';
  const success = workflow.status === 'completed';
  const duration = workflow.duration || 0;

  recordTask(agent, intent, success, duration);
}

/**
 * Get routing suggestion for orchestrator
 * Returns agent name that should handle this intent
 */
function suggestAgent(intent) {
  // First check if we have data
  const candidates = getAgentsForIntent(intent);

  if (candidates.length === 0) {
    // No history - return null to let orchestrator use default behavior
    return null;
  }

  // Use safest agent for important tasks
  const safest = getSafestAgent(intent);

  // For low-risk intents (quick, fast), use fastest
  const fastIntents = ['quick', 'fast', 'search'];
  if (fastIntents.includes(intent)) {
    return getFastestAgent(intent) || safest;
  }

  return safest || candidates[0]?.agent;
}

// ========== EXPORTS ==========

module.exports = {
  recordTask,
  markBugIntroducedBy,
  getAgentScore,
  getAgentStats,
  getAgentsForIntent,
  getSafestAgent,
  getFastestAgent,
  getAgentLeaderboard,
  getIntentStats,
  onWorkflowComplete,
  suggestAgent,
  scores // For debugging
};
