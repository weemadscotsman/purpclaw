/**
 * PURPCLAW TASK DECOMPOSER
 * ========================
 * The missing organ.
 *
 * Sits between parseCommand() and buildExecutionPlan() in orchestrator.js.
 *
 * Takes a raw task string and produces:
 *   - Typed subtask slices
 *   - Agent ownership assignments
 *   - File ownership locks
 *   - Context depth per agent (surgical / standard / broad)
 *   - Dependency ordering
 *
 * The swarm stops behaving like freelancers in a Discord.
 * It starts behaving like a construction crew.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let routingMatrix = null;
try {
  routingMatrix = require('./agent_routing_matrix.js');
} catch (e) {
  // fallback: decomposer works standalone
}

let astGraph = null;
try {
  astGraph = require('./lib/ast-dependency-graph.js');
} catch {}

const PURP_DIR = __dirname;

// ── DOMAIN DEFINITIONS ────────────────────────────────────────────────────────
// Each domain has:
//   keywords    - words in the task text that signal this domain
//   filePatterns - regex array to match files this domain owns
//   division    - maps to AGENT_ROUTING division
//   preferred   - ordered list of agent names for this domain
//   contextDepth - how much context agents here need

const DOMAIN_DEFS = {
  backend: {
    keywords: [
      'api', 'server', 'endpoint', 'route', 'export', 'import',
      'database', 'db', 'query', 'migration', 'schema', 'model',
      'auth', 'authentication', 'token', 'session', 'cookie',
      'service', 'controller', 'handler', 'request', 'response',
      'wallet', 'transaction', 'payment', 'ledger', 'transfer',
    ],
    filePatterns: [
      /\/api\//i, /server\./i, /routes\//i, /controllers?\//i,
      /services?\//i, /models?\//i, /schema/i, /migrations?\//i,
      /handlers?\//i, /middleware\//i,
    ],
    division: 'INFRASTRUCTURE',
    preferred: ['cactus', 'robot', 'bee'],
    contextDepth: 'surgical',
  },

  frontend: {
    keywords: [
      'ui', 'component', 'layout', 'render', 'display', 'view',
      'dashboard', 'graph', 'chart', 'widget', 'panel', 'modal',
      'button', 'form', 'input', 'style', 'animation', 'screen',
      'page', 'navigation', 'menu', 'sidebar', 'header', 'footer',
    ],
    filePatterns: [
      /\/components?\//i, /\.tsx$/i, /\.jsx$/i, /\.css$/i,
      /\.scss$/i, /\/pages?\//i, /\/views?\//i, /\/layouts?\//i,
      /\/ui\//i, /\/app\//i,
    ],
    division: 'ENGINEERING',
    preferred: ['mushroom', 'duck', 'penguin'],
    contextDepth: 'visual',
  },

  middleware: {
    keywords: [
      'middleware', 'adapter', 'transform', 'serialize', 'deserialize',
      'bridge', 'pipe', 'stream', 'connector', 'integration',
      'reconnect', 'wire', 'hook', 'eventbus', 'bus',
      'data flow', 'pipeline', 'broker',
    ],
    filePatterns: [
      /middleware/i, /adapters?\//i, /transforms?\//i,
      /serializ/i, /bridges?\//i, /connectors?\//i,
      /pipelines?\//i,
    ],
    division: 'ENGINEERING',
    preferred: ['bee', 'octopus', 'robot'],
    contextDepth: 'standard',
  },

  security: {
    keywords: [
      'security', 'auth', 'permission', 'secret', 'key', 'encrypt',
      'decrypt', 'vulnerability', 'exploit', 'sanitize', 'xss',
      'injection', 'privilege', 'role', 'access', 'credential',
    ],
    filePatterns: [
      /auth/i, /security/i, /permissions?\//i,
      /tokens?\//i, /secrets?\//i, /credentials/i,
    ],
    division: 'SECURITY',
    preferred: ['guardian', 'snake', 'rabbit', 'owl'],
    contextDepth: 'broad',
  },

  testing: {
    keywords: [
      'test', 'spec', 'validate', 'verify', 'assertion',
      'coverage', 'regression', 'unit', 'integration', 'e2e',
      'fixture', 'qa', 'quality',
    ],
    filePatterns: [
      /\.test\./i, /\.spec\./i, /__tests__/i,
      /\/e2e\//i, /\/tests?\//i, /fixtures?\//i,
    ],
    division: 'ENGINEERING',
    preferred: ['rabbit', 'turtle', 'robot'],
    contextDepth: 'surgical',
  },

  data: {
    keywords: [
      'data', 'analytics', 'metrics', 'statistics', 'csv',
      'json', 'parse', 'format', 'aggregate', 'query',
      'report', 'dataset', 'chart data', 'feed', 'graph data',
    ],
    filePatterns: [
      /\/data\//i, /analytics/i, /reports?\//i,
      /\.csv$/i, /metrics/i,
    ],
    division: 'SCIENCE',
    preferred: ['numbers', 'duck', 'chart', 'crow'],
    contextDepth: 'standard',
  },

  infrastructure: {
    keywords: [
      'infra', 'infrastructure', 'deploy', 'docker', 'container',
      'environment', 'config', 'port', 'socket', 'websocket',
      'ci', 'cd', 'build', 'pipeline', 'script',
    ],
    filePatterns: [
      /Dockerfile/i, /docker-compose/i, /\.github\//i,
      /infra\//i, /deploy\//i, /scripts?\//i, /\.sh$/i,
      /\.env/i, /config\./i,
    ],
    division: 'INFRASTRUCTURE',
    preferred: ['cactus', 'void', 'gorilla'],
    contextDepth: 'surgical',
  },

  performance: {
    keywords: [
      'performance', 'slow', 'optimize', 'memory', 'cpu',
      'latency', 'speed', 'bottleneck', 'cache', 'benchmark',
    ],
    filePatterns: [
      /worker/i, /cache/i, /queue/i, /perf/i, /benchmark/i,
    ],
    division: 'INFRASTRUCTURE',
    preferred: ['chonk', 'fox', 'cactus'],
    contextDepth: 'surgical',
  },

  analysis: {
    keywords: [
      'analyze', 'analyse', 'investigate', 'diagnose', 'inspect',
      'understand', 'review', 'audit', 'scan', 'map', 'trace',
    ],
    filePatterns: [],
    division: 'INTELLIGENCE',
    preferred: ['hawk', 'turtle', 'octopus'],
    contextDepth: 'broad',
  },
};

// ── CLAUSE SPLITTER ───────────────────────────────────────────────────────────
// Splits a task string into natural-language clauses.

const CLAUSE_SPLITTERS = /\s+(and|also|then|additionally|plus|as well as|while|alongside)\s+|[,;]/gi;

function splitIntoClauses(taskText) {
  const raw = taskText.split(CLAUSE_SPLITTERS).map(s => s && s.trim()).filter(Boolean);
  // Remove conjunction words that end up as lone tokens
  const conjunctions = new Set(['and', 'also', 'then', 'additionally', 'plus', 'while', 'alongside', 'as well as']);
  return raw.filter(s => !conjunctions.has(s.toLowerCase()) && s.length > 3);
}

// ── DOMAIN CLASSIFIER ─────────────────────────────────────────────────────────
// Scores each clause against domain keyword lists and returns the best match.

function classifyClause(clause) {
  const lower = clause.toLowerCase();
  const scores = {};

  for (const [domain, def] of Object.entries(DOMAIN_DEFS)) {
    let score = 0;
    for (const kw of def.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0) scores[domain] = score;
  }

  if (Object.keys(scores).length === 0) return null;
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

// ── AGENT SELECTOR ────────────────────────────────────────────────────────────
// Picks the best agent for a domain, consulting agent_score if available.

function selectAgent(domain, agentScoreModule = null) {
  const def = DOMAIN_DEFS[domain];
  if (!def) return null;

  const candidates = def.preferred;
  if (!agentScoreModule) return candidates[0];

  // Ask agent_score to suggest the best performer from the candidate list
  for (const candidate of candidates) {
    const suggestion = agentScoreModule.suggestAgent(domain);
    if (suggestion && candidates.includes(suggestion)) return suggestion;
  }
  return candidates[0];
}

// ── OWNERSHIP LOCK BUILDER ────────────────────────────────────────────────────
// Assigns file pattern ownership to each subtask so agents don't step on each other.

function buildOwnershipLocks(subtasks) {
  const claimed = new Map(); // filePattern string → agentName

  for (const subtask of subtasks) {
    const def = DOMAIN_DEFS[subtask.domain];
    if (!def) continue;

    subtask.ownedPatterns = [];
    for (const pattern of def.filePatterns) {
      const key = pattern.toString();
      if (!claimed.has(key)) {
        claimed.set(key, subtask.agent);
        subtask.ownedPatterns.push(pattern);
      }
    }
  }
  return subtasks;
}

// ── DEPENDENCY BUILDER ────────────────────────────────────────────────────────
// Determines execution order. Backend before frontend, infra before everything,
// testing always last.

const DOMAIN_ORDER = {
  infrastructure: 0,
  backend:        1,
  middleware:     2,
  security:       3,
  data:           4,
  frontend:       5,
  performance:    6,
  analysis:       7,
  testing:        8,
};

function buildDependencyGraph(subtasks) {
  const sorted = [...subtasks].sort((a, b) => {
    const orderA = DOMAIN_ORDER[a.domain] ?? 5;
    const orderB = DOMAIN_ORDER[b.domain] ?? 5;
    return orderA - orderB;
  });

  // Each task depends on all earlier tasks in the sorted order
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].executionOrder = i + 1;
    sorted[i].dependsOn = sorted.slice(0, i).map(t => t.id);
  }

  return sorted;
}

// ── CONTEXT PACKET BUILDER ────────────────────────────────────────────────────
// Builds the surgical context description an agent receives.
// This is the "information scarcity" principle - agents get only what they need.

function buildContextPacket(subtask, fullTask) {
  const def = DOMAIN_DEFS[subtask.domain] || {};
  const mentionedFiles = extractTaskFiles(`${fullTask}\n${subtask.text}`);
  const astContext = buildReadOnlyDependencyContext(mentionedFiles);
  return {
    taskSlice:         subtask.text,
    fullTaskContext:   fullTask,
    domain:            subtask.domain,
    contextDepth:      def.contextDepth || 'standard',
    filePatterns:      (def.filePatterns || []).map(p => p.toString()),
    ownershipLock:     subtask.ownedPatterns || [],
    targetFiles:        mentionedFiles,
    readOnlyDependencies: astContext.readOnlyDependencies,
    dependencyGraph:    astContext.dependencyGraph,
    acceptanceCriteria: buildAcceptanceCriteria(subtask.domain, subtask.text),
    doNotTouch:        [] // populated by orchestrator from other agents' ownedPatterns
  };
}

function cleanFileCitation(value) {
  let candidate = String(value || '').trim();
  candidate = candidate.replace(/^["'`([{<]+|["'`)\]}>.,;:]+$/g, '');
  candidate = candidate.replace(/^file:\/+/, '');
  candidate = candidate.replace(/\\/g, '/');
  candidate = candidate.replace(/:\d{1,6}(?::\d{1,6})?$/, '');
  if (/^[A-Za-z]:\//.test(candidate)) {
    const relative = path.relative(PURP_DIR, candidate).replace(/\\/g, '/');
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) candidate = relative;
  }
  return candidate.replace(/^\/+/, '');
}

function extractTaskFiles(text) {
  const files = new Set();
  const add = (value) => {
    const cleaned = cleanFileCitation(value);
    if (/\s/.test(cleaned) && !fs.existsSync(path.join(PURP_DIR, cleaned))) return;
    if (cleaned && /\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)$/i.test(cleaned)) {
      files.add(cleaned);
    }
  };
  for (const match of String(text || '').matchAll(/`([^`]+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)(?::\d{1,6})?)`/gi)) {
    add(match[1]);
  }
  for (const match of String(text || '').matchAll(/(?:^|[\s(["'])((?:[A-Za-z]:[\\/])?[\w@.+~-]*(?:[\\/][\w@.+~-]+)*[\\/][\w@.+~-]+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)(?::\d{1,6})?)(?=$|[\s)"',;\]])/gi)) {
    add(match[1]);
  }
  for (const match of String(text || '').matchAll(/\b([\w@.+~-]+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql))\b/gi)) {
    add(match[1]);
  }
  const resolved = [...files];
  const exactPaths = new Set(resolved.filter(file => file.includes('/')).map(file => path.basename(file)));
  return resolved.filter(file => file.includes('/') || !exactPaths.has(file));
}

function buildReadOnlyDependencyContext(files) {
  if (!astGraph || !files.length) return { readOnlyDependencies: [], dependencyGraph: null };
  try {
    const context = astGraph.dependencyContext(files, { root: PURP_DIR, depth: 1 });
    const owned = new Set(files);
    const readOnlyDependencies = [...new Set(Object.values(context.targets || {}).flatMap(target => target.readOnlyContext || []))]
      .filter(file => !owned.has(file))
      .sort();
    return { readOnlyDependencies, dependencyGraph: context };
  } catch {
    return { readOnlyDependencies: [], dependencyGraph: null };
  }
}

function buildAcceptanceCriteria(domain, sliceText) {
  const base = [`Complete the task: "${sliceText}"`];
  switch (domain) {
    case 'backend':
      return [...base, 'No unhandled exceptions', 'API returns correct status codes', 'No regression in existing routes'];
    case 'frontend':
      return [...base, 'No console errors', 'Component renders without crash', 'Visual output matches intent'];
    case 'middleware':
      return [...base, 'Data flows through without loss', 'Errors propagate correctly', 'No silent failures'];
    case 'security':
      return [...base, 'No secrets exposed', 'Input validated', 'Auth checks preserved'];
    case 'testing':
      return [...base, 'Tests pass', 'Coverage maintained or improved', 'No skipped assertions'];
    case 'data':
      return [...base, 'Data shape matches expected schema', 'No data loss', 'Edge cases handled'];
    case 'infrastructure':
      return [...base, 'Service starts cleanly', 'Ports and envs correct', 'No leftover temp files'];
    case 'performance':
      return [...base, 'No regressions introduced', 'Measurable improvement or clear explanation why change was safe'];
    default:
      return base;
  }
}

// ── COMPLEXITY DETECTOR ───────────────────────────────────────────────────────
// Returns true if the task warrants decomposition (multi-domain signals detected).

function isComplexTask(taskText) {
  const lower = taskText.toLowerCase();
  let domainsHit = 0;
  for (const def of Object.values(DOMAIN_DEFS)) {
    for (const kw of def.keywords) {
      if (lower.includes(kw)) { domainsHit++; break; }
    }
    if (domainsHit >= 2) return true;
  }
  // Also complex if it contains explicit conjunction patterns
  return /\s+(and|also|then|additionally|plus|as well as)\s+/i.test(taskText);
}

// ── MAIN DECOMPOSITION FUNCTION ───────────────────────────────────────────────

/**
 * decomposeTask(rawTask, parsedIntent, agentScoreModule?)
 *
 * Returns null if the task is simple (single-agent is fine).
 * Returns a DecomposedTask object if multi-agent coordination is warranted.
 *
 * DecomposedTask {
 *   originalTask: string,
 *   subtasks: SubTask[],
 *   executionGraph: SubTask[], // ordered by dependency
 *   requiresTeam: boolean,
 *   summary: string
 * }
 *
 * SubTask {
 *   id: string,
 *   text: string,
 *   domain: string,
 *   agent: string,
 *   executionOrder: number,
 *   dependsOn: string[],
 *   ownedPatterns: RegExp[],
 *   contextPacket: ContextPacket,
 *   contextDepth: string
 * }
 */
function decomposeTask(rawTask, parsedIntent = null, agentScoreModule = null) {
  if (!rawTask || typeof rawTask !== 'string') return null;

  // Don't decompose if the task is simple
  if (!isComplexTask(rawTask)) return null;

  const clauses = splitIntoClauses(rawTask);
  if (clauses.length < 2) return null;

  // Classify each clause into a domain
  const classified = clauses.map((text, i) => {
    const domain = classifyClause(text) || parsedIntent || 'backend';
    const agent = selectAgent(domain, agentScoreModule);
    return {
      id: `subtask-${i + 1}-${domain}`,
      text,
      domain,
      agent: agent || 'robot',
      executionOrder: 0,
      dependsOn: [],
      ownedPatterns: [],
      contextPacket: null,
    };
  });

  // De-duplicate: if two clauses want the same agent, merge them
  const merged = [];
  for (const task of classified) {
    const existing = merged.find(t => t.agent === task.agent && t.domain === task.domain);
    if (existing) {
      existing.text = `${existing.text}; ${task.text}`;
    } else {
      merged.push({ ...task });
    }
  }

  // Build ownership locks (agents claim file patterns)
  buildOwnershipLocks(merged);

  // Build dependency graph (execution order)
  const ordered = buildDependencyGraph(merged);

  // Build context packets (surgical context per agent)
  for (const subtask of ordered) {
    subtask.contextPacket = buildContextPacket(subtask, rawTask);
  }

  // Wire doNotTouch: each agent gets the file patterns claimed by OTHER agents
  for (const subtask of ordered) {
    subtask.contextPacket.doNotTouch = ordered
      .filter(t => t.id !== subtask.id)
      .flatMap(t => t.ownedPatterns.map(p => p.toString()));
  }

  return {
    originalTask: rawTask,
    subtasks: ordered,
    executionGraph: ordered,
    requiresTeam: ordered.length > 1,
    summary: buildDecompositionSummary(ordered),
  };
}

function buildDecompositionSummary(subtasks) {
  const lines = subtasks.map(t =>
    `  [${t.executionOrder}] ${t.agent.toUpperCase()} ← ${t.domain}: "${t.text.substring(0, 60)}${t.text.length > 60 ? '...' : ''}"`
  );
  return `Decomposed into ${subtasks.length} ownership cells:\n${lines.join('\n')}`;
}

// ── ORCHESTRATOR INTEGRATION ──────────────────────────────────────────────────
// Helper: convert a DecomposedTask into the step format buildExecutionPlan uses.

function decomposedToExecutionSteps(decomposed) {
  if (!decomposed || !decomposed.requiresTeam) return null;

  return decomposed.subtasks.map((subtask, i) => ({
    order: 6 + i,
    stage: 'delegate',
    operation: `Assign ${subtask.domain} slice to ${subtask.agent}`,
    agentName: subtask.agent,
    subtaskId: subtask.id,
    subtaskText: subtask.text,
    domain: subtask.domain,
    contextPacket: subtask.contextPacket,
    dependsOn: subtask.dependsOn,
    ownedPatterns: subtask.ownedPatterns.map(p => p.toString()),
    contextDepth: subtask.contextDepth || 'standard',
    parallel: subtask.dependsOn.length === 0,
  }));
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  decomposeTask,
  decomposedToExecutionSteps,
  isComplexTask,
  classifyClause,
  splitIntoClauses,
  selectAgent,
  extractTaskFiles,
  DOMAIN_DEFS,
};
