'use strict';

/**
 * PURPCLAW HARNESS â€” Engine
 * =========================
 * Takes one complex goal, decomposes it into subtask contracts, dispatches each
 * through the 44-agent tower, runs PURPCLAW's verification gates, reviews the
 * output, escalates to KAREN on repeated failures, and synthesises a final
 * operator report.
 *
 * Reuses everything PURPCLAW already ships:
 *   - lib/llm-provider          â†’ provider-agnostic LLM calls (.chat / .swarm)
 *   - lib/job-contract          â†’ classifyJob + createJobContract + gates
 *   - Tower :7790 /api/spawn    â†’ real agent dispatch
 *   - Orchestrator :7784        â†’ workflow alternative path
 *   - State Store :7783         â†’ persistence
 *   - EventBus :7782            â†’ optional progress publishing
 *
 * Failure modes never kill a job:
 *   - LLM unreachable          â†’ deterministic fallback planner/reviewer/synthesizer
 *   - Tower/orchestrator unreachable â†’ fail loudly with a blocker
 *   - State Store unreachable  â†’ in-memory only, archived to file on shutdown
 *   - Karen unavailable        â†’ built-in escalation rules
 *
 * Public API:
 *   const { createHarness } = require('./lib/harness/engine');
 *   const h = createHarness({ rootDir, maxIterations, maxRetries });
 *   h.on('event', e => console.log(e));
 *   const job = await h.run(goal);
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');

const llm = require('../llm-provider');
const agentScore = (() => {
  try { return require('../../agent_score.js'); } catch { return null; }
})();
const memoryClient = (() => {
  try { return require('../memory-client'); } catch { return null; }
})();
const {
  classifyJob,
  createJobContract,
  formatContractForAgent,
  runVerificationGates
} = require('../job-contract');

const fish = (() => {
  try { return require('../accuracy-fish'); } catch { return null; }
})();

const mem = (() => {
  try { return require('../memory-client'); } catch { return null; }
})();

// â”€â”€ Ports (overridable via env) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PORTS = {
  tower:        parseInt(process.env.TOWER_PORT        || '7790', 10),
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '7784', 10),
  state:        parseInt(process.env.STATE_PORT        || '7783', 10),
  eventbus:     parseInt(process.env.EVENTBUS_PORT     || '7782', 10),
  api:          parseInt(process.env.API_PORT          || '7780', 10),
};

const DEFAULTS = {
  maxIterations: 30,
  maxRetriesPerSubtask: 2,
  toolTimeoutMs: 45_000,
  karenEscalateAfterFailures: 2,
};

const PURP_ROOT = path.resolve(__dirname, '..', '..');
const LESSONS_FILE = path.join(PURP_ROOT, 'agent_work', 'harness_lessons.jsonl');
const AGENT_REGISTRY_CACHE = { at: 0, names: null };

// â”€â”€ HTTP helpers (no deps) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function postJSON(port, urlPath, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

function getJSON(port, urlPath, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: timeoutMs,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function isOnline(port, healthPath = '/health') {
  try { await getJSON(port, healthPath, 1500); return true; }
  catch { return false; }
}

// â”€â”€ ID + time helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const now = () => Date.now();
const mkId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Strip reasoning-token wrappers some providers (MiniMax, DeepSeek-R1, QwQ, etc.)
 * emit before the actual answer. Handles both <think>...</think> and bare leading
 * <think>... (no close) plus markdown code-fences around JSON.
 */
function scrubLLMText(text) {
  if (!text) return '';
  let out = String(text);
  // Strip full <think>...</think> blocks
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Strip dangling opening <think> if no close (some streams truncate)
  out = out.replace(/^[\s\S]*?<\/think>/i, m => m.replace(/^[\s\S]*?<\/think>/i, ''));
  // Strip orphan opening <think> with no close at all
  if (out.includes('<think>') && !out.includes('</think>')) {
    out = out.replace(/<think>[\s\S]*$/i, '');
  }
  // Strip leading reasoning prefixes some models use
  out = out.replace(/^(reasoning|thinking|<reasoning>|<thinking>)[:>\s]*[\s\S]*?(?=\{|\[|#|\w)/i, '');
  return out.trim();
}

function extractFirstJSON(text) {
  if (!text) return null;
  const cleaned = scrubLLMText(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to find the first {...} or [...] block
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }
  return null;
}

// â”€â”€ Planner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fallbackPlan(goal) {
  const trimmed = goal.replace(/\s+/g, ' ').trim();
  const tag = trimmed.length > 96 ? `${trimmed.slice(0, 96)}â€¦` : trimmed;
  return [
    { description: `Clarify the requested outcome and acceptance criteria for: ${tag}`, rationale: 'Front-load operator intent before delegation.' },
    { description: 'Identify ordered phases, dependencies, and per-phase preferred agents.', rationale: 'Lets the tower route to the right specialist.' },
    { description: 'Execute the highest-confidence implementation or operational action first.', rationale: 'Move the job forward instead of stalling at planning.' },
    { description: 'Verify the result against acceptance criteria and run available gates.', rationale: 'Catch regressions before synthesis.' },
    { description: 'Synthesise the accepted deliverables into an operator-ready report.', rationale: 'Operator needs outcome + proof + remaining blockers in one surface.' }
  ];
}

async function decomposeGoal(goal, pastContext = '') {
  const system = `You are PURPCLAW's harness planner. Break the operator goal into 3â€“7 concrete, independently-verifiable subtasks. Each subtask must produce a tangible artifact, decision, or piece of information that a swarm agent (penguin/dragon/wolf/owl/karen/etc.) can deliver.

Return ONLY JSON in this shape:
{ "subtasks": [ { "description": "...", "rationale": "..." } ] }

No markdown fences, no prose.`;

  const user = `${pastContext ? 'PAST RELEVANT LESSONS & TACTICS FOR REFERENCE:\n' + pastContext + '\n\n' : ''}OPERATOR GOAL:\n${goal}`;

  const resp = await llm.swarm([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { temperature: 0.3, maxTokens: 2048, responseFormat: { type: 'json_object' } });

  const parsed = extractFirstJSON(resp.content);
  if (!parsed) throw new Error('Planner returned non-JSON');
  const subs = Array.isArray(parsed?.subtasks) ? parsed.subtasks : [];
  if (subs.length === 0) throw new Error('Planner returned no subtasks');
  return subs.slice(0, 7);
}

// â”€â”€ Reviewer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fallbackReview(output, gateResult) {
  if (output.includes('[BLOCKED:')) {
    return { verdict: 'REJECTED', reason: 'Executor reported an operator-blocking dependency.' };
  }
  if (gateResult && !gateResult.ok) {
    const failed = (gateResult.results || []).filter(r => !r.ok).map(r => r.gate).join(', ');
    return {
      verdict: 'CHALLENGED',
      reason: `Verification gates failed: ${failed || 'unknown'}`,
      refinementGuidance: 'Address the failing gate output and resubmit.'
    };
  }
  if ((output || '').trim().length < 120) {
    return {
      verdict: 'CHALLENGED',
      reason: 'Deliverable is too short to prove the subtask was handled.',
      refinementGuidance: 'Add concrete output, evidence, file paths, or test results.'
    };
  }
  return { verdict: 'ACCEPTED', reason: 'Concrete deliverable; gates passed or not applicable.' };
}

async function reviewSubtask(goal, subtask, output, gateResult) {
  const system = `You are PURPCLAW's per-subtask judge. Verdicts:
- ACCEPTED: concrete, addresses the subtask, gates pass (or none applicable).
- CHALLENGED: partial / vague / one specific element missing.
- REJECTED: hallucinated, off-topic, or violates a hard constraint.

Return ONLY JSON:
{ "verdict": "ACCEPTED" | "CHALLENGED" | "REJECTED", "reason": "...", "refinementGuidance": "only if CHALLENGED" }`;

  const gateSummary = gateResult
    ? `\nGATE_RESULT: ${gateResult.ok ? 'all pass' : 'failures = ' + (gateResult.results || []).filter(r => !r.ok).map(r => r.gate).join(', ')}`
    : '';

  const user = `GOAL: ${goal}\nSUBTASK: ${subtask.description}${gateSummary}\n\nDELIVERABLE:\n${(output || '').slice(0, 4000)}`;

  const resp = await llm.chat([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { temperature: 0.2, maxTokens: 800, responseFormat: { type: 'json_object' } });

  const parsed = extractFirstJSON(resp.content);
  if (!parsed || !parsed.verdict) throw new Error('Reviewer returned non-JSON or missing verdict');
  return parsed;
}

// â”€â”€ Karen â€” escalation gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function escalateToKaren(job, subtask, history) {
  // Karen as escalation specialist (matches agents/karen.md). She decides:
  //   retry / re-route / halt / file_ticket
  const system = `You are KAREN â€” PURPCLAW's escalation specialist. A subtask has failed multiple times. Choose ONE action and explain crisply (no fluff, no apologies, structured like an incident report).

Return ONLY JSON:
{ "action": "retry" | "reroute" | "halt" | "file_ticket", "reason": "...", "newPreferredAgents": ["agent1","agent2"] | null, "ticketSummary": "string only if file_ticket" }`;

  const user = `WORKFLOW: ${job.id}
GOAL: ${job.goal}
SUBTASK: #${subtask.index + 1} ${subtask.description}
PREFERRED_AGENTS: ${(subtask.contract?.preferredAgents || []).join(', ') || 'unset'}
ATTEMPTS: ${history.length}
LATEST_VERDICT: ${history.at(-1)?.verdict || 'unknown'}
LATEST_REASON: ${history.at(-1)?.reason || 'unknown'}
LAST_DELIVERABLE (first 800 chars): ${(history.at(-1)?.output || '').slice(0, 800)}`;

  try {
    const resp = await llm.chat([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], { temperature: 0.3, maxTokens: 600, responseFormat: { type: 'json_object' } });
    const parsed = extractFirstJSON(resp.content);
    if (!parsed || !parsed.action) throw new Error('Karen returned non-JSON');
    return parsed;
  } catch {
    // Karen-LLM unavailable â†’ built-in escalation policy
    return fallbackKaren(subtask, history);
  }
}

function fallbackKaren(subtask, history) {
  const attempts = history.length;
  const allChallenged = history.every(h => h.verdict === 'CHALLENGED');
  if (allChallenged && attempts <= 3) {
    return {
      action: 'retry',
      reason: `Subtask has been challenged ${attempts}Ã— consecutively. One more refined attempt warranted before re-routing.`,
      newPreferredAgents: null
    };
  }
  if (subtask.contract?.preferredAgents?.length > 1) {
    return {
      action: 'reroute',
      reason: 'Rotating to alternate preferred agent â€” current agent has stalled.',
      newPreferredAgents: subtask.contract.preferredAgents.slice(1)
    };
  }
  return {
    action: 'file_ticket',
    reason: `Subtask #${subtask.index + 1} could not be completed after ${attempts} attempts. Operator review required.`,
    ticketSummary: `${subtask.description} â€” failed after ${attempts} attempts`
  };
}

// â”€â”€ Synthesiser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fallbackSynthesis(job) {
  const accepted = job.plan.filter(s => s.state === 'accepted');
  if (accepted.length === 0) return 'No accepted deliverables â€” nothing to synthesise.';
  const sections = accepted.map(s =>
    `### ${s.index + 1}. ${s.description}\n\n${s.output || '(empty)'}\n\n_Judge: ${s.verdictReason || 'accepted'}_  \n_Agent: ${s.dispatchedTo || 'unrouted'}_`);
  return `# Operator Report (fallback synthesis)\n\n**Goal:** ${job.goal}\n\n**Accepted:** ${accepted.length}/${job.plan.length}\n**Tools/Calls:** ${job.toolsUsed || 0}\n\n---\n\n${sections.join('\n\n---\n\n')}`;
}

async function synthesizeReport(job) {
  const acceptedOutputs = job.plan
    .filter(s => s.state === 'accepted' && s.output)
    .map(s => `### ${s.index + 1}. ${s.description}  \n_Agent: ${s.dispatchedTo || 'unrouted'}_\n\n${s.output}`)
    .join('\n\n');
  if (!acceptedOutputs) return 'No accepted deliverables â€” nothing to synthesise.';

  const system = `You are PURPCLAW's harness synthesiser. Combine the accepted subtask deliverables into one cohesive final operator report. Cite each subtask number. Keep it tight, scannable, actionable. Surface remaining blockers explicitly.`;
  const user = `ORIGINAL GOAL:\n${job.goal}\n\nACCEPTED DELIVERABLES:\n${acceptedOutputs}\n\nFAILED OR ESCALATED:\n${job.plan.filter(s => s.state !== 'accepted').map(s => `#${s.index + 1} ${s.state.toUpperCase()}: ${s.verdictReason || '(no reason)'}`).join('\n') || '(none)'}\n\nProduce the final report now.`;

  const resp = await llm.chat([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { temperature: 0.4, maxTokens: 3000 });

  const scrubbed = scrubLLMText(resp.content || '');
  return scrubbed || fallbackSynthesis(job);
}

// â”€â”€ Tower dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function normaliseAgentName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

async function getRegisteredAgentNames() {
  const age = now() - AGENT_REGISTRY_CACHE.at;
  if (AGENT_REGISTRY_CACHE.names && age < 30_000) return AGENT_REGISTRY_CACHE.names;
  try {
    const status = await getJSON(PORTS.tower, '/tower/status', 2000);
    const rows = [
      ...(status.registeredAgents || []),
      ...(status.activeAgents || []),
    ];
    const names = new Set(rows.map(a => normaliseAgentName(a.name || a.agentName || a.id)).filter(Boolean));
    AGENT_REGISTRY_CACHE.at = now();
    AGENT_REGISTRY_CACHE.names = names.size ? names : null;
    return AGENT_REGISTRY_CACHE.names;
  } catch {
    return null;
  }
}

async function rankPreferredAgents(intent, preferredAgents = []) {
  const base = preferredAgents.map(normaliseAgentName).filter(Boolean);
  const registered = await getRegisteredAgentNames();
  const ranked = [];

  if (agentScore) {
    try {
      const suggested = agentScore.suggestAgent(intent);
      if (suggested) ranked.push(normaliseAgentName(suggested));
    } catch {}
    try {
      for (const row of agentScore.getAgentsForIntent(intent, 12) || []) {
        ranked.push(normaliseAgentName(row.agent));
      }
    } catch {}
  }

  const valid = (name) => {
    if (!name) return false;
    if (registered) return registered.has(name);
    return base.includes(name);
  };

  const ordered = [...new Set([
    ...ranked.filter(valid),
    ...base.filter(name => !registered || registered.has(name)),
    ...base,
  ])];

  return {
    selected: ordered[0] || 'wolf',
    ordered: ordered.length ? ordered : ['wolf'],
    ranked: [...new Set(ranked)].slice(0, 8),
    registryChecked: Boolean(registered),
  };
}

async function dispatchToTower(subtask, contract) {
  // Try POST /api/spawn on tower; fall back to POST /api/orchestrate.
  const scoreRoute = await rankPreferredAgents(contract.routeIntent || 'build', contract.preferredAgents || []);
  contract.preferredAgents = scoreRoute.ordered;
  subtask.scoreRouting = scoreRoute;
  const preferred = scoreRoute.selected;
  const payload = {
    task: subtask.description,
    contract,
    agent: preferred,
    source: 'harness',
    intent: contract.routeIntent || 'build',
  };

  // Try tower first
  try {
    if (await isOnline(PORTS.tower, '/tower/health')) {
      const result = await postJSON(PORTS.tower, '/api/spawn', payload, 60_000);
      return { ok: true, route: 'tower', agent: preferred, scoreRouting: scoreRoute, raw: result, output: extractOutput(result) };
    }
  } catch (e) {
    // fall through
  }

  // Try orchestrator
  try {
    if (await isOnline(PORTS.orchestrator, '/api/health')) {
      const result = await postJSON(PORTS.orchestrator, '/api/orchestrate', payload, 60_000);
      return { ok: true, route: 'orchestrator', agent: preferred, scoreRouting: scoreRoute, raw: result, output: extractOutput(result) };
    }
  } catch (e) {
    // fall through
  }

  throw new Error('Dispatch failed: tower and orchestrator are offline. No fallback execution is allowed.');
}

function extractOutput(towerResult) {
  if (!towerResult) return '';
  return (
    towerResult.output
    || towerResult.result
    || towerResult.deliverable
    || towerResult.summary
    || towerResult.raw
    || (typeof towerResult === 'string' ? towerResult : JSON.stringify(towerResult).slice(0, 3000))
  );
}

function appendJsonl(filePath, row) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

function recordHarnessScore(subtask, success, duration, extras = {}) {
  if (!agentScore || !subtask) return;
  const agentName = normaliseAgentName(extras.agent || subtask.lastDispatch?.agent || subtask.dispatchedTo?.split(' ')[0]);
  if (!agentName) return;
  try {
    agentScore.recordTask(agentName, subtask.contract?.routeIntent || 'build', Boolean(success), Math.max(0, duration || 0), {
      ...extras,
      source: 'harness',
      subtaskId: subtask.id,
    });
  } catch {}
}

async function rememberSubtaskLesson(job, subtask, success) {
  const agentName = normaliseAgentName(subtask.lastDispatch?.agent || subtask.dispatchedTo?.split(' ')[0] || 'agent');
  const lesson = {
    timestamp: new Date().toISOString(),
    jobId: job.id,
    goal: job.goal,
    subtaskId: subtask.id,
    intent: subtask.contract?.routeIntent || 'build',
    agent: agentName,
    success: Boolean(success),
    description: subtask.description,
    verdict: subtask.verdict || subtask.state,
    verdictReason: subtask.verdictReason || '',
    outputPreview: String(subtask.output || '').slice(0, 700),
  };

  try {
    appendJsonl(LESSONS_FILE, lesson);
  } catch {}

  if (memoryClient) {
    try {
      lesson.memoryId = await memoryClient.postTask(
        subtask.description,
        `${success ? 'ACCEPTED' : 'FAILED'}: ${subtask.verdictReason || ''}\n${subtask.output || ''}`,
        agentName,
        Boolean(success)
      );
    } catch {}
  }

  job.learnedLessons = job.learnedLessons || [];
  job.learnedLessons.push(lesson);
  return lesson;
}

// â”€â”€ Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function persistJob(job) {
  // Try the State Store first; fall back to local file under agent_work/.
  try {
    if (await isOnline(PORTS.state, '/health')) {
      await putJSON(PORTS.state, `/state/harness/${encodeURIComponent(`job:${job.id}`)}`, {
        value: job,
        ttl: 0
      }, 5_000);
      return { persisted: 'state-store' };
    }
  } catch { /* fall through */ }

  try {
    const dir = path.join(PURP_ROOT, 'agent_work', 'harness');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${job.id}.json`), JSON.stringify(job, null, 2));
    return { persisted: 'file' };
  } catch (e) {
    return { persisted: 'none', error: e.message };
  }
}

async function publishEvent(topic, payload) {
  try {
    await postJSON(PORTS.eventbus, '/publish', { topic, payload }, 1500);
  } catch { /* best-effort */ }
}

// â”€â”€ Harness Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class HarnessEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULTS, ...options };
    this.rootDir = options.rootDir || PURP_ROOT;
    this.job = null;
    this.stopRequested = false;
  }

  stop() {
    this.stopRequested = true;
    if (this.job && this.isActive()) {
      this.job.state = 'stopped';
      this.job.finishedAt = now();
      this.emitTrace('operator', 'harness.stopped', 'operator interrupt');
      this.emit('state', this.job);
    }
  }

  isActive() {
    if (!this.job) return false;
    return ['planning', 'executing', 'reviewing', 'synthesizing'].includes(this.job.state);
  }

  async run(goal) {
    if (this.isActive()) throw new Error('Engine already running â€” call stop() first');

    this.stopRequested = false;
    this.job = {
      id: mkId('harness'),
      goal: String(goal || '').trim(),
      state: 'planning',
      plan: [],
      log: [],
      trace: [],
      scratchpad: [],
      iteration: 0,
      maxIterations: this.options.maxIterations,
      toolsUsed: 0,
      startedAt: now(),
      classification: classifyJob(String(goal || ''))
    };

    this.log('info', `Harness goal received: ${this.job.goal.slice(0, 120)}`);
    this.emitTrace('operator', 'goal.received', this.job.goal.slice(0, 96));
    this.emit('start', this.job);
    publishEvent('harness.job.started', { jobId: this.job.id, goal: this.job.goal });

    try {
      // 1. PLAN
      this.log('info', `Classification: ${this.job.classification.type} (${this.job.classification.confidence})`);
      this.emitTrace('orchestrator', 'plan.requested', 'decomposing goal via llm.swarm');
      let rawSubtasks = null;
      try {
        let pastContext = '';
        if (memoryClient) {
          try {
            const res = await memoryClient.recall(this.job.goal, { limit: 4 });
            if (res && res.formatted) {
              pastContext = res.formatted;
              this.log('info', `Recalled past context from Memory Matrix`);
            }
          } catch (e) {}
        }
        rawSubtasks = await decomposeGoal(this.job.goal, pastContext);
        this.emitTrace('llm', 'plan.ok', `${rawSubtasks.length} subtasks`);
      } catch (e) {
        this.log('warn', `Planner LLM failed (${e.message}) â€” using deterministic fallback plan`);
        this.emitTrace('llm', 'plan.fallback', 'deterministic plan');
        rawSubtasks = fallbackPlan(this.job.goal);
        this.job.usedFallbackPlanner = true;
      }

      this.job.plan = rawSubtasks.map((s, index) => {
        const contract = createJobContract(s.description, { raw: s.description }, { source: 'harness' });
        
        // Auto-staffing: Use historical scores to prioritize preferred agents
        if (agentScore && contract.routeIntent) {
          try {
            const ranked = agentScore.getAgentsForIntent(contract.routeIntent, 4);
            if (ranked && ranked.length > 0) {
              const bestAgents = ranked.map(r => r.agent);
              const merged = [...new Set([...bestAgents, ...(contract.preferredAgents || [])])];
              contract.preferredAgents = merged;
            }
          } catch (e) {}
        }

        return {
          id: mkId('st'),
          index,
          description: s.description,
          rationale: s.rationale || '',
          state: 'pending',
          attempts: 0,
          contract,
          dispatchedTo: null,
          karenEscalations: []
        };
      });

      this.emitTrace('tower', 'plan.ready', `${this.job.plan.length} ordered subtasks`);
      this.job.state = 'executing';
      this.emit('state', this.job);

      // 2. EXECUTE
      for (const subtask of this.job.plan) {
        if (this.stopRequested) break;
        if (this.job.iteration >= this.job.maxIterations) {
          this.log('warn', `Iteration ceiling (${this.job.maxIterations}) reached â€” halting`);
          break;
        }
        await this.runSubtask(subtask);
        this.emit('state', this.job);
      }

      if (this.stopRequested) {
        await this.finalise('stopped');
        return this.job;
      }

      // 3. SYNTHESISE
      this.job.state = 'synthesizing';
      this.emitTrace('llm', 'synthesis.requested', 'combine accepted deliverables');
      this.emit('state', this.job);
      try {
        // â”€â”€ Fish audit on synthesis input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Run fish on the synthesis draft before it becomes the final report.
        // If fish slaps HARD or RED, the synthesis itself needs revision.
        let fishSynthesisAudit = null;
        if (fish) {
          try {
            const synthesisDraft = await synthesizeReport(this.job).catch(() => fallbackSynthesis(this.job));
            fishSynthesisAudit = fish.audit(synthesisDraft, {
              jobId:   this.job.id,
              agentId: 'harness-synthesis',
              evidence: { files: {}, logs: [], tests: [] },
            });
            this.emitTrace('fish', 'synthesis.' + fishSynthesisAudit.overallVerdict,
              `${fishSynthesisAudit.claims.length} claims, ${fishSynthesisAudit.slapLog.length} slaps`,
              this.job.id);
            if (!fishSynthesisAudit.releaseReady) {
              this.log('warn', `ðŸŸ Fish: synthesis ${fishSynthesisAudit.overallVerdict} â€” ${fishSynthesisAudit.slapLog.length} correction(s) needed`);
              // Downgrade certainty in the synthesis header
              const header = `> **Accuracy Fish audit:** ${fishSynthesisAudit.overallCertainty} â€” ${fishSynthesisAudit.slapLog.length} claim(s) need correction\n\n`;
              this.job.finalReport = header + synthesisDraft;
            } else {
              this.job.finalReport = synthesisDraft;
            }
            this.emitTrace('llm', 'synthesis.ok', `${this.job.finalReport.length} chars`);
          } catch (e) {
            this.log('warn', `Fish synthesis audit failed: ${e.message} â€” proceeding without fish`);
            this.job.finalReport = await synthesizeReport(this.job);
            this.emitTrace('llm', 'synthesis.ok', `${this.job.finalReport.length} chars`);
          }
        } else {
          this.job.finalReport = await synthesizeReport(this.job);
          this.emitTrace('llm', 'synthesis.ok', `${this.job.finalReport.length} chars`);
        }
      } catch (e) {
        this.log('warn', `Synthesiser LLM failed (${e.message}) â€” using deterministic fallback`);
        this.job.finalReport = fallbackSynthesis(this.job);
        this.emitTrace('llm', 'synthesis.fallback', 'deterministic merge');
      }

      // 4. FINAL
      const anyAccepted = this.job.plan.some(s => s.state === 'accepted');
      await this.finalise(anyAccepted ? 'done' : 'failed');
      return this.job;
    } catch (error) {
      this.log('error', `Harness fatal: ${error?.message || error}`);
      await this.finalise('failed');
      return this.job;
    }
  }

  async runSubtask(subtask) {
    subtask.state = 'in_progress';
    subtask.startedAt = now();
    this.log('info', `â–¶ Subtask #${subtask.index + 1}: ${subtask.description}`);
    this.emitTrace('tower', 'subtask.dispatched', subtask.description.slice(0, 80), subtask.id);
    this.emit('subtask', subtask);

    const verdictHistory = [];
    const maxRetries = this.options.maxRetriesPerSubtask;

    while (subtask.attempts <= maxRetries) {
      if (this.stopRequested) return;
      subtask.attempts += 1;
      this.job.iteration += 1;

      // DISPATCH
      let dispatchResult = null;
      const dispatchStartedAt = now();
      try {
        dispatchResult = await dispatchToTower(subtask, subtask.contract);
        const dispatchDuration = now() - dispatchStartedAt;
        subtask.lastDispatch = {
          agent: dispatchResult.agent,
          route: dispatchResult.route,
          duration: dispatchDuration,
          scoreRouting: dispatchResult.scoreRouting || subtask.scoreRouting || null,
        };
        subtask.dispatchedTo = `${dispatchResult.agent} (${dispatchResult.route})`;
        subtask.output = dispatchResult.output;
        if (dispatchResult.scoreRouting) {
          this.emitTrace('score', 'routing.applied',
            `${dispatchResult.agent} selected from ${dispatchResult.scoreRouting.ordered.join(', ')}`, subtask.id);
        }
        this.emitTrace(dispatchResult.route, 'dispatch.ok', `${dispatchResult.agent} responded`, subtask.id);
        this.job.toolsUsed = (this.job.toolsUsed || 0) + 1;
      } catch (e) {
        this.log('error', `Dispatch failed: ${e.message}`);
        this.emitTrace('tower', 'dispatch.failed', e.message, subtask.id);
        recordHarnessScore(subtask, false, now() - dispatchStartedAt, { dispatchError: true });
        verdictHistory.push({ verdict: 'REJECTED', reason: `Dispatch error: ${e.message}` });
        if (subtask.attempts > maxRetries) {
          subtask.state = 'failed';
          subtask.verdictReason = `Dispatch failed: ${e.message}`;
          subtask.finishedAt = now();
          return;
        }
        continue;
      }

      // BLOCKED check
      if ((subtask.output || '').includes('[BLOCKED:')) {
        subtask.state = 'failed';
        subtask.verdictReason = 'Operator-blocking dependency reported by agent';
        recordHarnessScore(subtask, false, subtask.lastDispatch?.duration || 0, { blocked: true });
        await rememberSubtaskLesson(this.job, subtask, false);
        this.log('warn', `Subtask #${subtask.index + 1} blocked â€” operator input required`);
        this.emitTrace('mirrorvale', 'subtask.blocked', 'operator must supply', subtask.id);
        subtask.finishedAt = now();
        return;
      }

      // GATES
      let gateResult = null;
      try {
        gateResult = runVerificationGates(this.rootDir, subtask.contract, { timeoutMs: 90_000 });
        this.emitTrace('gates', gateResult.ok ? 'gates.ok' : 'gates.failed',
          `${(gateResult.results || []).length} gate(s)`, subtask.id);
      } catch (e) {
        this.log('warn', `Gate runner errored: ${e.message}`);
      }
      subtask.gateResult = gateResult;

      // REVIEW
      this.job.state = 'reviewing';
      let review = null;
      try {
        review = await reviewSubtask(this.job.goal, subtask, subtask.output, gateResult);
      } catch (e) {
        this.log('warn', `Reviewer LLM failed (${e.message}) â€” using fallback review`);
        review = fallbackReview(subtask.output, gateResult);
      }
      subtask.verdict = review.verdict;
      subtask.verdictReason = review.reason;
      verdictHistory.push({ ...review, output: subtask.output });
      this.log('verdict', `Subtask #${subtask.index + 1} â†’ ${review.verdict}: ${review.reason}`);
      this.emitTrace('mirrorvale', `subtask.${review.verdict.toLowerCase()}`, review.reason.slice(0, 80), subtask.id);

      if (review.verdict === 'ACCEPTED') {
        // â”€â”€ Fish: check subtask output before marking accepted â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Even if the judge accepted it, fish might find unsupported claims.
        // HARD_SLAP / RED_SLAP / TANK_MODE â†’ override ACCEPTED to CHALLENGED.
        let fishOverridden = false;
        if (fish && subtask.output) {
          try {
            const fishResult = fish.audit(subtask.output, {
              jobId:   this.job.id,
              agentId: subtask.lastDispatch?.agent || subtask.dispatchedTo || 'agent',
              evidence: { files: {}, logs: [], tests: [] },
            });
            this.emitTrace('fish', 'subtask.' + fishResult.overallVerdict,
              `${fishResult.claims.length} claims, ${fishResult.slapLog.length} slaps`,
              subtask.id);
            subtask.fishAudit = {
              verdict:      fishResult.overallVerdict,
              certainty:    fishResult.overallCertainty,
              slapCount:    fishResult.slapLog.length,
              slapLog:      fishResult.slapLog,
              releaseReady: fishResult.releaseReady,
            };
            // RED_SLAP or TANK_MODE â†’ escalate to CHALLENGED
            if ([fish.VERDICT.RED_SLAP, fish.VERDICT.TANK_MODE].includes(fishResult.overallVerdict)) {
              const correction = fish.routeCorrection(fishResult);
              this.job.scratchpad.push(`ðŸŸ FISH OVERRIDE subtask #${subtask.index + 1}: ${fishResult.overallVerdict} â€” ${correction.message}`);
              this.log('warn', `ðŸŸ Fish overrode ACCEPTED â†’ CHALLENGED on subtask #${subtask.index + 1} (${fishResult.overallVerdict})`);
              review.verdict = 'CHALLENGED';
              review.reason = `Fish: ${fishResult.overallVerdict} â€” ${fishResult.slapLog[0]?.reason || 'unsupported claim'}`;
              review.refinementGuidance = fishResult.slapLog.map(s => s.correction || s.reason).join('; ');
              verdictHistory.push({ ...review, output: subtask.output });
              fishOverridden = true;
            } else if (fishResult.overallVerdict === fish.VERDICT.HARD_SLAP) {
              // HARD_SLAP â†’ log but keep ACCEPTED; surface in final report
              this.log('warn', `ðŸŸ Fish HARD_SLAP on subtask #${subtask.index + 1} â€” accepted but claim issues noted`);
            }
          } catch (e) {
            this.log('warn', `Fish audit on subtask #${subtask.index + 1} errored: ${e.message}`);
          }
        }

        // Only complete ACCEPTED path if fish didn't override
        if (!fishOverridden) {
          subtask.state = 'accepted';
          this.job.scratchpad.push(`#{subtask.index + 1} (${subtask.description.slice(0, 80)}): ${(subtask.output || '').slice(0, 320)}`);
          subtask.finishedAt = now();
          recordHarnessScore(subtask, true, subtask.lastDispatch?.duration || (now() - subtask.startedAt), {
            reviewReason: review.reason,
            route: subtask.lastDispatch?.route,
          });
          await rememberSubtaskLesson(this.job, subtask, true);
          this.job.state = 'executing';
          this.emit('subtask', subtask);
          return;
        }
      }

      if (review.verdict === 'REJECTED') {
        subtask.state = 'rejected';
        subtask.finishedAt = now();
        recordHarnessScore(subtask, false, subtask.lastDispatch?.duration || (now() - subtask.startedAt), {
          reviewReason: review.reason,
          route: subtask.lastDispatch?.route,
        });
        await rememberSubtaskLesson(this.job, subtask, false);

        this.job.state = 'executing';
        this.emit('subtask', subtask);
        return;
      }

      // CHALLENGED â†’ either retry, or escalate to Karen if we've challenged too many times
      subtask.state = 'challenged';
      const challengedCount = verdictHistory.filter(v => v.verdict === 'CHALLENGED').length;
      if (challengedCount >= this.options.karenEscalateAfterFailures) {
        this.emitTrace('karen', 'escalation.invoked', `${challengedCount} consecutive challenges`, subtask.id);
        const decision = await escalateToKaren(this.job, subtask, verdictHistory);
        subtask.karenEscalations.push({ at: now(), decision });
        this.log('warn', `KAREN[${subtask.id}] action=${decision.action} â€” ${decision.reason}`);
        this.emitTrace('karen', `decision.${decision.action}`, decision.reason.slice(0, 80), subtask.id);

        if (decision.action === 'reroute' && decision.newPreferredAgents) {
          subtask.contract.preferredAgents = decision.newPreferredAgents;
          this.job.scratchpad.push(`KAREN reroute #${subtask.index + 1}: agents â†’ ${decision.newPreferredAgents.join(', ')}`);
          continue; // try again with new agent
        }
        if (decision.action === 'retry') {
          this.job.scratchpad.push(`KAREN retry #${subtask.index + 1}: ${decision.reason}`);
          continue;
        }
        if (decision.action === 'halt') {
          subtask.state = 'failed';
          subtask.verdictReason = `KAREN halted: ${decision.reason}`;
          subtask.finishedAt = now();
          recordHarnessScore(subtask, false, subtask.lastDispatch?.duration || 0, { karenAction: 'halt' });
          await rememberSubtaskLesson(this.job, subtask, false);
          return;
        }
        if (decision.action === 'file_ticket') {
          subtask.state = 'failed';
          subtask.verdictReason = `KAREN ticket filed: ${decision.ticketSummary || decision.reason}`;
          subtask.finishedAt = now();
          recordHarnessScore(subtask, false, subtask.lastDispatch?.duration || 0, { karenAction: 'file_ticket' });
          await rememberSubtaskLesson(this.job, subtask, false);
          await publishEvent('harness.karen.ticket', {
            jobId: this.job.id,
            subtaskId: subtask.id,
            ticket: decision.ticketSummary,
            reason: decision.reason
          });
          return;
        }
      }

      // Normal CHALLENGED retry with refinement guidance
      const guidance = review.refinementGuidance || review.reason;
      this.job.scratchpad.push(`REFINE #${subtask.index + 1}: ${guidance}`);
      this.log('warn', `Subtask #${subtask.index + 1} challenged â€” refining (attempt ${subtask.attempts + 1}/${maxRetries + 1})`);
    }

    subtask.state = 'failed';
    subtask.verdictReason = subtask.verdictReason || 'Exhausted retry budget';
    subtask.finishedAt = now();
    recordHarnessScore(subtask, false, subtask.lastDispatch?.duration || (now() - subtask.startedAt), {
      retryBudgetExhausted: true,
    });
    await rememberSubtaskLesson(this.job, subtask, false);
    this.job.state = 'executing';
  }

  async finalise(finalState) {
    this.job.state = finalState;
    this.job.finishedAt = now();
    this.log('info', `Harness complete â€” state=${finalState}`);
    this.emitTrace('operator', `harness.${finalState}`,
      `${this.job.plan.filter(s => s.state === 'accepted').length}/${this.job.plan.length} accepted`);
    if (this.job.finalReport && this.job.learnedLessons?.length) {
      const lessons = this.job.learnedLessons
        .filter(l => l.success)
        .slice(-6)
        .map(l => `- ${l.intent}/${l.agent}: ${l.description}`)
        .join('\n');
      if (lessons) this.job.finalReport += `\n\n## Remembered Lessons\n${lessons}`;
    }
    const persisted = await persistJob(this.job);
    this.job.persisted = persisted;
    await publishEvent('harness.job.finished', { jobId: this.job.id, state: finalState });
    this.emit('done', this.job);
    
    // Fire-and-forget: run benchmark + mutator after successful harness completion
    if (finalState === 'completed') {
      try {
        const bench = require('./benchmark');
        bench.runBenchmark(this.job.plan?.[0]?.intent || 'harness-run').catch(() => {});
      } catch {}
      try {
        const { mutator } = require('../evolution/mutator');
        mutator.runPass({ auto: true }).catch(() => {});
      } catch {}
    }
  }

  // â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  log(level, message, detail) {
    if (!this.job) return;
    const entry = { timestamp: now(), level, message, detail };
    this.job.log.push(entry);
    if (this.job.log.length > 500) this.job.log.shift();
    this.emit('log', entry);
  }

  emitTrace(stage, event, summary, subtaskId) {
    if (!this.job) return;
    const entry = { timestamp: now(), stage, event, summary, subtaskId };
    this.job.trace.push(entry);
    if (this.job.trace.length > 200) this.job.trace.shift();
    this.emit('trace', entry);
  }
}

// â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createHarness(options = {}) {
  return new HarnessEngine(options);
}

module.exports = {
  HarnessEngine,
  createHarness,
  PORTS,
  // Exposed for tests
  fallbackPlan,
  fallbackReview,
  fallbackSynthesis,
  fallbackKaren,
};
