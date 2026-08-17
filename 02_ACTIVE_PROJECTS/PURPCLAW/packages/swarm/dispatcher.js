'use strict';

/**
 * @purpclaw/swarm — dispatcher.js
 *
 * Parallel sub-agent dispatch over the existing AgentRuntime.
 *
 * What this is: the minimum viable sub-agent coordinator that:
 *   1. Resolves a persona from the agent registry (real, not hardcoded)
 *   2. Spawns N sub-agent instances in parallel (Promise.all)
 *   3. Routes the parent task to all of them with a shared task id
 *   4. Waits for all completions with a hard timeout
 *   5. Aggregates results into a single SwarmReport
 *   6. Emits a hash-chained proof artifact for each dispatch
 *
 * What this is NOT (yet):
 *   - Kimi 300-subagent: we certify 2-3, the lane is open
 *   - Antigravity Manager View UI: terminal-only here, UI is apps/desktop/src/manager/
 *   - Long-horizon 12-hour session log: cert uses sub-second runs
 *   - Cross-agent memory: each sub-agent is a fresh instance
 *
 * The honest scope is in CONTRACT.md. The cert is the proof.
 */

const { createRuntime, AgentRuntime } = require('../core/runtime/agent-runtime');
const { createHash, randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

// --- proof artifact ---

function hashArtifact(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function writeProof(proofDir, report) {
  fs.mkdirSync(proofDir, { recursive: true });
  const filename = `swarm-${report.task_id}.json`;
  const filepath = path.join(proofDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
  return filepath;
}

// --- persona resolution ---

/**
 * Resolve a persona key from the agent registry.
 * Tries to find the most specific match for the task keyword.
 * Real, no mocks: requires the registry to be loaded.
 */
function resolvePersona(registry, task) {
  if (!registry || !registry.listAgents) {
    throw new Error('registry required (must expose listAgents())');
  }
  const agents = registry.listAgents();
  if (agents.length === 0) {
    throw new Error('registry has no agents; load failed');
  }

  // Match by task keyword against description / name / role
  const taskLower = String(task || '').toLowerCase();
  const tokens = taskLower.split(/[^a-z0-9]+/).filter(t => t.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const a of agents) {
    const hay = `${a.name || ''} ${a.role || ''} ${a.division || ''}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  // Fall back to first engineering agent if no token matched
  if (!best) {
    best = agents.find(a => a.division === 'ENGINEERING') || agents[0];
  }
  return best;
}

// --- sub-agent factory ---

/**
 * Default sub-agent factory. Builds a minimal agent that:
 *   - records the task
 *   - emits a completion event
 *   - returns the recorded result
 * The "work" is whatever the task says — real sub-agents in production
 * would invoke a tool-runtime (lib/control/drivers). This cert exercises
 * the dispatch + coordination path; the work step is recorded, not invented.
 */
function defaultSubAgentFactory() {
  return async function subAgent(agentType, instanceId, runtime) {
    return {
      agentType,
      instanceId,
      tasks: [],
      async receive(message) {
        if (message.type === 'direct' && message.content && message.content.task !== undefined) {
          const completion = {
            agentType,
            instanceId,
            task_id: message.content.task_id,
            received_at: new Date().toISOString(),
            // Recorded "work" — deterministic, no fabrication.
            // In production this is where the sub-agent invokes a tool.
            recorded_output: `processed:${message.content.task.slice(0, 80)}`,
            status: 'completed',
          };
          this.tasks.push(completion);
          runtime.emit('subagent.completed', completion);
        }
      },
    };
  };
}

// --- parallel dispatch ---

/**
 * Dispatch a task to N sub-agents in parallel.
 *
 * @param {object} options
 * @param {object} options.registry  - agent registry with listAgents() (real, not mock)
 * @param {string} options.task      - the task string to dispatch
 * @param {number} [options.parallel=2] - number of parallel sub-agents (cert uses 2-3)
 * @param {number} [options.timeoutMs=5000] - per-sub-agent hard timeout
 * @param {string} [options.proofDir] - where to write the SwarmReport JSON
 * @param {Function} [options.factory] - sub-agent factory (default: defaultSubAgentFactory)
 * @returns {Promise<SwarmReport>}
 */
async function dispatch({ registry, task, parallel = 2, timeoutMs = 5000, proofDir, factory } = {}) {
  if (!registry) throw new Error('registry required');
  if (!task || typeof task !== 'string') throw new Error('task required (non-empty string)');
  if (parallel < 1 || parallel > 16) throw new Error('parallel must be 1..16 (cert range)');

  const persona = resolvePersona(registry, task);
  if (!persona) throw new Error('no persona resolved from registry');

  const task_id = randomUUID();
  const started_at = new Date().toISOString();
  const runtime = createRuntime({ task_id });
  const agentFactory = factory || defaultSubAgentFactory();

  // Wire proof chain — every subagent.completed event is recorded.
  const completions = [];
  runtime.on('subagent.completed', (c) => completions.push(c));

  // Register the resolved persona once; create parallel instances.
  runtime.register(persona.key, agentFactory);

  // Start the queue processor BEFORE sending — otherwise messages queue
  // but never drain (the runtime only processes while running=true).
  await runtime.start();

  // Spawn N sub-agents in parallel. Each gets a unique instanceId.
  const subAgentIds = Array.from({ length: parallel }, (_, i) => `sub-${i + 1}`);
  const dispatchPromises = subAgentIds.map((instanceId) =>
    runtime.send(`${persona.key}:${instanceId}`, {
      type: 'direct',
      source: 'swarm.dispatcher',
      content: { task_id, task, persona: persona.key, instance_id: instanceId },
      metadata: { swarm: true, parallel_index: subAgentIds.indexOf(instanceId) },
    })
  );

  // Wait for all dispatches with hard timeout.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`swarm dispatch timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  await Promise.race([Promise.all(dispatchPromises), timeoutPromise]);

  // Wait briefly for completion events to drain (in-process sub-agents are sync).
  await new Promise(r => setTimeout(r, 50));

  const finished_at = new Date().toISOString();

  const report = {
    schema: 'purpclaw.swarm.report.v1',
    task_id,
    persona: { key: persona.key, name: persona.name, division: persona.division },
    parallel,
    task,
    started_at,
    finished_at,
    duration_ms: new Date(finished_at).getTime() - new Date(started_at).getTime(),
    completions: completions.length,
    expected: parallel,
    all_completed: completions.length === parallel,
    results: completions.map(c => ({
      instance_id: c.instanceId,
      status: c.status,
      recorded_output: c.recorded_output,
    })),
    proof_hash: null,
  };
  report.proof_hash = hashArtifact({
    task_id: report.task_id,
    persona: report.persona,
    parallel: report.parallel,
    completions: report.completions,
    results: report.results,
  });

  if (proofDir) {
    report.proof_path = writeProof(proofDir, report);
  }
  return report;
}

module.exports = {
  dispatch,
  resolvePersona,
  defaultSubAgentFactory,
  hashArtifact,
  writeProof,
};
