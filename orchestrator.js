/**
 * PURPCLAW ORCHESTRATOR v2.0
 * ============================
 * Central orchestration layer for PURPCLAW
 * Owns the command flow: voice → parse → route → execute → respond
 *
 * Features:
 * - Multi-stage workflow pipeline with parallel execution
 * - Priority queue with urgent bypass
 * - Agent load balancing and smart routing
 * - Self-healing with automatic retry/recovery
 * - Real-time SSE streaming responses
 * - Swarm memory for context persistence
 * - Cross-service coordination via EventBus
 *
 * Port: 7784 (HTTP API for orchestrator commands)
 */

require('./lib/runtime/telemetry-console').installConsoleTelemetry('purpclaw-orchestrator');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// Agent scoring for smarter routing ("You need a machine, not a society")
let agentScore = null;
try {
  agentScore = require('./agent_score.js');
  console.log('[ORCHESTRATOR] Agent scoring system loaded');
} catch (e) {
  console.log('[ORCHESTRATOR] agent_score.js not available - using fallback routing');
}

// Locked interfaces for protecting critical tools
let lockedInterfaces = null;
try {
  lockedInterfaces = require('./locked_interfaces.js');
  console.log('[ORCHESTRATOR] Locked interfaces system loaded');
} catch (e) {
  console.log('[ORCHESTRATOR] locked_interfaces.js not available - no tool restrictions');
}

// Hivemind: trace every workflow, promote successful patterns into skills,
// and inject proven skills into future runtime context. Optional by design: if
// the module is absent or broken, the stack still boots. No more glass-jaw AI opera.
let HIVEMIND = null;
try {
  HIVEMIND = require('./lib/hivemind');
  console.log('[ORCHESTRATOR] Hivemind layer loaded');
} catch (e) {
  console.log('[ORCHESTRATOR] Hivemind unavailable - continuing without continual-learning hooks:', e.message);
}

// Ports
const ORCHESTRATOR_PORT = 7784;
const EVENTBUS_PORT = 7782;
const STATE_PORT = 7783;
const API_PORT = 7780;
const TOWER_PORT = 7790;
const VOICE_COORD_PORT = 7781;
const SPINE_PORT = 7880;

// ========== AGENT REGISTRY ==========

const AGENT_BY_INTENT = {
  design: ['dragon', 'owl'],
  architect: ['dragon'],
  plan: ['penguin', 'wolf'],
  build: ['robot', 'dragon', 'bee'],
  code: ['robot', 'bee'],
  fix: ['cactus', 'rabbit'],
  debug: ['cactus', 'rabbit'],
  refactor: ['axolotl', 'mushroom'],
  design_ui: ['mushroom', 'duck', 'penguin'],
  interface: ['mushroom', 'penguin'],
  security: ['spider', 'ghost', 'guardian', 'snake'],
  audit: ['ghost', 'owl', 'snake'],
  research: ['spider', 'duck', 'raven'],
  data: ['duck', 'crow'],
  web: ['spider'],
  optimize: ['chonk', 'fox'],
  system: ['chonk', 'turtle'],
  analyze: ['turtle', 'octopus', 'hawk'],
  test: ['rabbit', 'turtle', 'robot'],
  review: ['owl', 'karen', 'ghost'],
  validate: ['robot', 'rabbit'],
  coordinate: ['wolf', 'penguin'],
  lead: ['wolf'],
  manage: ['penguin', 'karen'],
  media: ['goose', 'parrot', 'duck'],
  content: ['phoenix', 'parrot', 'panda'],
  quick: ['bunny', 'mantis'],
  fast: ['bunny', 'mantis'],
  infrastructure: ['cactus', 'void', 'raven'],
  server: ['cactus', 'fox'],
  deploy: ['gorilla', 'shark'],
  heavy: ['gorilla'],
};

const TEAM_TEMPLATES = {
  build: { leader: 'wolf', members: ['robot', 'bee'], description: 'Building' },
  design: { leader: 'wolf', members: ['mushroom', 'penguin', 'duck'], description: 'Designing' },
  research: { leader: 'spider', members: ['raven', 'duck', 'crow'], description: 'Researching' },
  audit: { leader: 'owl', members: ['ghost', 'snake', 'rabbit'], description: 'Auditing' },
  fix: { leader: 'cactus', members: ['robot', 'rabbit'], description: 'Fixing' },
  analyze: { leader: 'turtle', members: ['octopus', 'hawk'], description: 'Analyzing' },
  deploy: { leader: 'gorilla', members: ['shark', 'chonk'], description: 'Deploying' },
  optimize: { leader: 'chonk', members: ['fox', 'cactus'], description: 'Optimizing' },
  refactor: { leader: 'axolotl', members: ['mushroom', 'robot', 'void'], description: 'Refactoring' },
  test: { leader: 'rabbit', members: ['turtle', 'robot'], description: 'Testing' },
  review: { leader: 'owl', members: ['karen', 'ghost'], description: 'Reviewing' },
  security: { leader: 'spider', members: ['ghost', 'guardian', 'snake'], description: 'Securing' },
};

const INTENT_PATTERNS = [
  { pattern: /swarm\s+status/i, intent: 'swarm_status', useTeam: false },
  { pattern: /swarm\s+(.+)/i, intent: 'swarm_mission', useTeam: false },
  { pattern: /build\s+(.+)/i, intent: 'build', useTeam: true },
  { pattern: /create\s+(.+)/i, intent: 'build', useTeam: true },
  { pattern: /make\s+(.+)/i, intent: 'build', useTeam: true },
  { pattern: /design\s+(.+)/i, intent: 'design', useTeam: true },
  { pattern: /fix\s+(.+)/i, intent: 'fix', useTeam: false },
  { pattern: /debug\s+(.+)/i, intent: 'debug', useTeam: false },
  { pattern: /research\s+(.+)/i, intent: 'research', useTeam: true },
  { pattern: /analyze\s+(.+)/i, intent: 'analyze', useTeam: true },
  { pattern: /audit\s+(.+)/i, intent: 'audit', useTeam: true },
  { pattern: /test\s+(.+)/i, intent: 'test', useTeam: true },
  { pattern: /review\s+(.+)/i, intent: 'review', useTeam: true },
  { pattern: /deploy\s+(.+)/i, intent: 'deploy', useTeam: true },
  { pattern: /optimize\s+(.+)/i, intent: 'optimize', useTeam: false },
  { pattern: /refactor\s+(.+)/i, intent: 'refactor', useTeam: true },
  { pattern: /coordinate\s+(.+)/i, intent: 'coordinate', useTeam: true },
  { pattern: /status/i, intent: 'status', useTeam: false },
  { pattern: /list\s+agents/i, intent: 'list_agents', useTeam: false },
  { pattern: /list\s+tasks/i, intent: 'list_tasks', useTeam: false },
  { pattern: /kill\s+(.+)/i, intent: 'kill', useTeam: false },
  { pattern: /stop\s+(.+)/i, intent: 'stop', useTeam: false },
  { pattern: /search\s+(.+)/i, intent: 'search', useTeam: false },
  { pattern: /find\s+(.+)/i, intent: 'search', useTeam: false },
  { pattern: /open\s+(.+)/i, intent: 'open', useTeam: false },
  { pattern: /close\s+(.+)/i, intent: 'close', useTeam: false },
  { pattern: /start\s+(.+)/i, intent: 'start', useTeam: false },
];

// ========== SWARM MEMORY ==========

const SWARM_MEMORY = {
  session: {
    id: `swarm-${Date.now()}`,
    startTime: new Date().toISOString(),
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
  },
  context: {
    recentCommands: [],
    activeAgents: [],
    completedWork: [],
    patternLibrary: [],
  },
  metrics: {
    avgResponseTime: 0,
    totalTokens: 0,
    agentUtilization: {},
    queueDepth: 0,
    toolUsage: {},
    byIntent: {},
  }
};

// ========== AGENT HEARTBEAT / TTL ==========
// Agents that haven't sent a heartbeat in AGENT_HEARTBEAT_TTL_MS are zombies.
// completed/failed agents are also zombies — they shouldn't persist in activeAgents.
const AGENT_HEARTBEAT_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const AGENT_TTL_CLEANUP_INTERVAL_MS = 60 * 1000;  // check every minute

function toTimestampMs(value, fallback = Date.now()) {
  if (typeof value === 'number') return value;
  const parsed = new Date(value || fallback).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function agentEventType(data) {
  return data?.type || data?.event?.type || data?.event?.topic || data?.topic || null;
}

function isTerminalAgentEvent(type) {
  return type === 'agent.completed' || type === 'agent.failed' || type === 'agent.killed';
}

/**
 * Prune agents that:
 *  - have no live heartbeat (TTL expired)
 *  - are terminal (agent.completed / agent.failed)
 *  - are from a previous swarm session
 * Returns { cleared, remaining }.
 */
function pruneDeadAgents() {
  const now = Date.now();
  const before = SWARM_MEMORY.context.activeAgents.length;
  const sessionStart = toTimestampMs(SWARM_MEMORY.session.startTime, 0);

  SWARM_MEMORY.context.activeAgents = SWARM_MEMORY.context.activeAgents.filter(a => {
    const type = agentEventType(a);
    if (isTerminalAgentEvent(type)) return false;
    const agentTime = toTimestampMs(a.event?.timestamp, 0);
    if (agentTime < sessionStart) return false;
    const lastHb = typeof a.lastHeartbeat === 'number'
      ? a.lastHeartbeat
      : toTimestampMs(a.event?.timestamp, 0);
    if (!Number.isFinite(lastHb) || lastHb <= 0) return false;
    if (now - lastHb > AGENT_HEARTBEAT_TTL_MS) return false;
    return true;
  });

  const remaining = SWARM_MEMORY.context.activeAgents.length;
  return { cleared: before - remaining, remaining };
}

// Periodic TTL purge — prevents zombie accumulation between DELETE calls
setInterval(() => {
  const { cleared, remaining } = pruneDeadAgents();
  if (cleared > 0) {
    log(`[PURGE] Cleared ${cleared} dead agent(s) — ${remaining} still alive`);
  }
}, AGENT_TTL_CLEANUP_INTERVAL_MS).unref();

// Boot-time reconciliation: clear any stale agents left from a crashed prev process
pruneDeadAgents();

// ========== PRIORITY QUEUE ==========

class PriorityQueue {
  constructor() {
    this.items = [];
    this.priorityLevels = { urgent: 0, high: 1, normal: 2, low: 3 };
  }

  enqueue(item, priority = 'normal') {
    const pLevel = this.priorityLevels[priority] ?? 2;
    const entry = { ...item, _priority: pLevel, _enqueuedAt: Date.now() };

    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i]._priority > pLevel) {
        this.items.splice(i, 0, entry);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.items.push(entry);

    SWARM_MEMORY.metrics.queueDepth = this.items.length;
    return this.size();
  }

  dequeue() {
    const item = this.items.shift();
    SWARM_MEMORY.metrics.queueDepth = this.items.length;
    return item;
  }

  peek() { return this.items[0]; }
  size() { return this.items.length; }
  isEmpty() { return this.items.length === 0; }

  getByPriority(priority) {
    const pLevel = this.priorityLevels[priority] ?? 2;
    return this.items.filter(i => i._priority === pLevel);
  }

  remove(predicate) {
    this.items = this.items.filter(i => !predicate(i));
    SWARM_MEMORY.metrics.queueDepth = this.items.length;
  }
}

// ========== WORKFLOW PIPELINE ==========

class WorkflowPipeline {
  constructor(stages) {
    this.stages = stages;
    this.results = {};
  }

  async execute(context, handlers) {
    let currentContext = { ...context };

    for (const stage of this.stages) {
      log(`Pipeline[${stage.name}]: Starting...`);
      const startTime = Date.now();

      if (handlers[stage.name]) {
        const result = await handlers[stage.name](currentContext);
        currentContext = { ...currentContext, ...result };
        this.results[stage.name] = { success: true, duration: Date.now() - startTime, data: result };
      }

      log(`Pipeline[${stage.name}]: Done in ${Date.now() - startTime}ms`);
    }

    return currentContext;
  }
}

const DEFAULT_PIPELINE = new WorkflowPipeline([
  { name: 'parse' },
  { name: 'route' },
  { name: 'validate' },
  { name: 'execute' },
  { name: 'respond' }
]);

// ========== AGENT POOL ==========

class AgentPool {
  constructor() {
    this.available = new Map();
    this.busy = new Map();
    this.loadHistory = [];
  }

  register(agentName) {
    if (!this.available.has(agentName)) {
      this.available.set(agentName, { count: 0, lastUsed: 0 });
    }
  }

  markBusy(agentName) {
    this.available.delete(agentName);
    this.busy.set(agentName, { startTime: Date.now() });
  }

  markAvailable(agentName) {
    this.busy.delete(agentName);
    this.available.set(agentName, { count: (this.available.get(agentName)?.count || 0) + 1, lastUsed: Date.now() });
  }

  getLeastLoaded() {
    let best = null;
    let lowestLoad = Infinity;

    for (const [name, info] of this.available) {
      const load = info.count;
      if (load < lowestLoad) {
        lowestLoad = load;
        best = name;
      }
    }
    return best;
  }

  getStats() {
    return {
      available: this.available.size,
      busy: this.busy.size,
      total: this.available.size + this.busy.size
    };
  }
}

// ========== SELF-HEALING (CONTEXT-AWARE) ==========

class SelfHealer {
  constructor() {
    this.failureCount = new Map();
    this.failedAgents = new Map();  // Track which agents have failed this workflow
    this.maxRetries = 3;
    this.backoffBase = 1000;
  }

  recordFailure(workflowId, agentName = null) {
    const count = (this.failureCount.get(workflowId) || 0) + 1;
    this.failureCount.set(workflowId, count);

    // Track which agent failed
    if (agentName) {
      const failed = this.failedAgents.get(workflowId) || new Set();
      failed.add(agentName);
      this.failedAgents.set(workflowId, failed);
    }
    return count;
  }

  getBackoff(workflowId) {
    const failures = this.failureCount.get(workflowId) || 0;
    return Math.min(this.backoffBase * Math.pow(2, failures), 30000);
  }

  shouldRetry(workflowId) {
    return (this.failureCount.get(workflowId) || 0) < this.maxRetries;
  }

  // Get agents that haven't failed this workflow yet
  getAvailableAgents(workflowId, candidates) {
    const failed = this.failedAgents.get(workflowId) || new Set();
    return candidates.filter(a => !failed.has(a));
  }

  // Get a different agent for retry (context-aware retry)
  getRetryAgent(workflowId, intent) {
    const candidates = AGENT_BY_INTENT[intent] || [intent];
    const available = this.getAvailableAgents(workflowId, candidates);

    if (available.length === 0) {
      // All agents have failed, reset and try any candidate
      this.failedAgents.delete(workflowId);
      return candidates[0];
    }

    // Use agent_score to pick the best available agent
    if (agentScore) {
      const ranked = agentScore.getAgentsForIntent(intent, 10);
      for (const rankedAgent of ranked) {
        if (available.includes(rankedAgent.agent)) {
          return rankedAgent.agent;
        }
      }
    }

    return available[0];
  }

  clearFailure(workflowId) {
    this.failureCount.delete(workflowId);
    this.failedAgents.delete(workflowId);
  }
}

// ========== MAIN ORCHESTRATOR ==========

const taskQueue = new PriorityQueue();
const activeWorkflows = new Map();
const completedWorkflows = new Map();
const sseClients = new Set();
const agentPool = new AgentPool();
const selfHealer = new SelfHealer();
const activeStreams = new Map();

let workflowIdCounter = 0;
let isProcessingQueue = false;

function log(...args) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[ORCHESTRATOR] ${ts} |`, ...args);
}

// ========== EVENTBUS COMMUNICATION ==========

function publishEvent(topic, data) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ topic, ...data, timestamp: new Date().toISOString() });
    const req = http.request({
      hostname: 'localhost',
      port: EVENTBUS_PORT,
      path: '/publish',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(true));
    });
    req.on('error', (e) => {
      log('EventBus publish error:', e.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

async function subscribeToEventBus(topicPattern) {
  try {
    // Node.js doesn't have EventSource, use http + SSE parsing instead
    const http = require('http');

    const req = http.request({
      hostname: 'localhost',
      port: EVENTBUS_PORT,
      path: `/events/${topicPattern}`,
      method: 'GET'
    }, (res) => {
      log(`EventBus subscription connected: ${topicPattern}`);

      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleBusEvent(data);
            } catch (e) {
              // Skip parse errors for non-JSON messages like ": connected"
            }
          }
        }
      });

      res.on('error', (e) => {
        log(`EventBus SSE error for ${topicPattern}:`, e.message);
      });

      res.on('close', () => {
        log(`EventBus subscription closed: ${topicPattern}`);
        // Reconnect after delay
        setTimeout(() => subscribeToEventBus(topicPattern), 5000);
      });
    });

    req.on('error', (e) => {
      log('EventBus subscribe error:', e.message);
      setTimeout(() => subscribeToEventBus(topicPattern), 5000);
    });

    req.end();
  } catch (e) {
    log('EventBus subscribe error:', e.message);
    return null;
  }
}

function handleBusEvent(event) {
  const { topic } = event;

  if (topic.startsWith('agent.')) {
    handleAgentEvent(event);
  } else if (topic.startsWith('tool.')) {
    handleToolEvent(event);
  } else if (topic.startsWith('system.')) {
    handleSystemEvent(event);
  } else if (topic.startsWith('voice.')) {
    handleVoiceEvent(event);
  }

  broadcastToClients(event);
}

function handleAgentEvent(event) {
  const { agentId, type, workflowId } = event;

  if (workflowId && activeWorkflows.has(workflowId)) {
    const workflow = activeWorkflows.get(workflowId);

    if (type === 'agent.completed') {
      workflow.steps.completed = Math.min(workflow.steps.total || workflow.steps.completed + 1, workflow.steps.completed + 1);
      workflow.result = event.output || 'Task completed';
    } else if (type === 'agent.failed') {
      handleWorkflowFailure(workflowId, event.error);
    } else if (type === 'agent.progress') {
      broadcastProgress(workflowId, event.progress);
    }
  }

  updateSwarmMemory('agent', { agentId, type, event });
}

function handleToolEvent(event) {
  updateSwarmMemory('tool', event);
}

function handleSystemEvent(event) {
  if (event.type === 'system.error') {
    log('System error event:', event.message);
    // Could trigger alerts here
  }
}

function handleVoiceEvent(event) {
  // Voice commands go through orchestration
  if (event.command) {
    enqueueWorkflow({ command: event.command, source: 'voice', priority: event.urgent ? 'urgent' : 'normal' });
  }
}

function updateSwarmMemory(type, data) {
  if (type === 'agent') {
    const event = data.event || {};
    const agentId = data.agentId || event.agentId;
    const eventType = agentEventType(data);
    if (!agentId || !eventType) return;

    const eventTime = toTimestampMs(event.timestamp);
    const sessionStart = toTimestampMs(SWARM_MEMORY.session.startTime, 0);
    const isReplay = eventTime < sessionStart;

    // Heartbeat ping — just refresh timestamp, don't re-add the agent
    if (eventType === 'agent.heartbeat') {
      const idx = SWARM_MEMORY.context.activeAgents.findIndex(a => a.agentId === agentId);
      if (idx !== -1) {
        SWARM_MEMORY.context.activeAgents[idx].lastHeartbeat = eventTime;
      }
      return;
    }
    // Remove any stale entry for this agentId before adding updated record
    SWARM_MEMORY.context.activeAgents = SWARM_MEMORY.context.activeAgents.filter(a => a.agentId !== agentId);

    if (isTerminalAgentEvent(eventType)) {
      if (!isReplay) {
        SWARM_MEMORY.context.completedWork.unshift({
          agentId,
          type: eventType,
          name: event.name || data.name,
          workflowId: event.workflowId || data.workflowId || null,
          status: event.status || (eventType === 'agent.completed' ? 'completed' : 'failed'),
          timestamp: event.timestamp || new Date(eventTime).toISOString(),
          output: event.output,
          error: event.error
        });
        SWARM_MEMORY.context.completedWork = SWARM_MEMORY.context.completedWork.slice(0, 100);
      }
      return;
    }

    if (eventType === 'agent.spawned' || eventType === 'agent.progress') {
      if (isReplay) return;
      SWARM_MEMORY.context.activeAgents.push({
        ...data,
        agentId,
        type: eventType,
        lastHeartbeat: eventTime
      });
    }
  } else if (type === 'tool') {
    const existing = SWARM_MEMORY.metrics.toolUsage?.[data.tool] || { count: 0, totalDuration: 0 };
    SWARM_MEMORY.metrics.toolUsage[data.tool] = {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + (data.duration || 0)
    };
  }
}

// ========== STATE MANAGEMENT ==========

async function updateState(namespace, key, value) {
  try {
    const payload = JSON.stringify(value);
    const res = await fetch(`http://localhost:${STATE_PORT}/state/${namespace}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    return await res.json();
  } catch (e) {
    log('State update error:', e.message);
    return null;
  }
}

async function getState(namespace, key) {
  try {
    const url = key
      ? `http://localhost:${STATE_PORT}/state/${namespace}/${key}`
      : `http://localhost:${STATE_PORT}/state/${namespace}`;
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    log('State get error:', e.message);
    return null;
  }
}

// ========== HTTP CLIENT HELPERS ==========

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function towerRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: TOWER_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function stateRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: STATE_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ========== COGNITIVE SPINE ==========

function spineRequest(method, path, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: SPINE_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve({ error: 'spine_parse_error' }); }
      });
    });
    req.on('error', () => resolve({ error: 'spine_unavailable' }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ========== COMMAND PARSING ==========

function parseCommand(text) {
  const lower = text.toLowerCase().trim();

  // Check for urgent indicators
  const urgentPatterns = [/(?:urgent|asap|emergency|critical|immediately|rush)/i];
  const isUrgent = urgentPatterns.some(p => p.test(text));

  for (const pattern of INTENT_PATTERNS) {
    const match = lower.match(pattern.pattern);
    if (match) {
      return {
        intent: pattern.intent,
        useTeam: pattern.useTeam,
        target: match[1] || null,
        raw: text,
        urgent: isUrgent
      };
    }
  }

  return { intent: 'general', useTeam: false, target: text, raw: text, urgent: isUrgent };
}

function validateCommand(parsed) {
  const errors = [];

  if (!parsed.intent) {
    errors.push('Could not determine intent');
  }

  if (parsed.useTeam && !TEAM_TEMPLATES[parsed.intent]) {
    errors.push(`Intent "${parsed.intent}" does not support team execution`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ========== WORKFLOW EXECUTION ==========

function enqueueWorkflow(workflowInput) {
  const priority = workflowInput.urgent ? 'urgent' : (workflowInput.priority || 'normal');
  const queuePos = taskQueue.enqueue(workflowInput, priority);
  log(`Enqueued workflow: "${workflowInput.command?.substring(0, 50)}..." (priority: ${priority}, queue: ${queuePos})`);

  // Process immediately if not already processing
  if (!isProcessingQueue) {
    processQueue();
  }

  return queuePos;
}

async function processQueue() {
  if (isProcessingQueue || taskQueue.isEmpty()) return;

  isProcessingQueue = true;

  while (!taskQueue.isEmpty()) {
    const workflowInput = taskQueue.dequeue();
    const workflowId = `wf-${Date.now()}-${workflowIdCounter++}`;

    try {
      await executeWorkflow(workflowId, workflowInput);
    } catch (e) {
      log(`Workflow ${workflowId} execution error:`, e.message);
    }

    // Brief pause between workflows to prevent hammering
    await new Promise(r => setTimeout(r, 50));
  }

  isProcessingQueue = false;
}

async function executeWorkflow(workflowId, workflowInput) {
  const startTime = Date.now();
  const priorWorkflow = activeWorkflows.get(workflowId);
  const isRetryAttempt = Boolean(priorWorkflow);

  const workflow = {
    id: workflowId,
    command: workflowInput.command,
    source: workflowInput.source || 'api',
    parsed: parseCommand(workflowInput.command),
    status: 'parsing',
    priority: workflowInput.urgent ? 'urgent' : (workflowInput.priority || 'normal'),
    startTime: priorWorkflow?.startTime || new Date().toISOString(),
    steps: { total: 0, completed: 0 },
    agentId: null,
    teamId: null,
    result: null,
    error: null,
    retryCount: selfHealer.failureCount.get(workflowId) || priorWorkflow?.retryCount || 0,
    streamId: workflowInput.streamId
  };

  activeWorkflows.set(workflowId, workflow);

  // Hivemind runtime hook: load relevant proven skills before the mission runs,
  // and open a trace so this run can become future skill/doctrine material.
  if (HIVEMIND) {
    try {
      const hm = isRetryAttempt && priorWorkflow?.hivemind
        ? priorWorkflow.hivemind
        : HIVEMIND.startWorkflowTrace(workflow);
      workflow.hivemind = hm;
      workflow.hivemindTraceId = hm.trace?.run_id || hm.run_id || null;
      workflow.hivemindSkills = hm.skills || [];
      workflow.hivemindAntiSkills = hm.antiskills || [];
      if (workflow.hivemindTraceId) {
        HIVEMIND.recordWorkflowStage(workflow, 'loaded', {
          skills: workflow.hivemindSkills.map(s => s.skill_id),
          antiskills: workflow.hivemindAntiSkills.map(s => s.skill_id),
        });
      }
    } catch (e) {
      workflow.hivemindError = e.message;
      log(`[HIVEMIND] load/start failed for ${workflowId}: ${e.message}`);
    }
  }

  if (!isRetryAttempt) {
    SWARM_MEMORY.session.totalTasks++;
  }

  // ── Pipeline spine: register so this workflow is watchable/stoppable on the
  // health board (carry the job id across retries via priorWorkflow). ──────
  try {
    const reg = require('./lib/pipeline-registry');
    workflow.pipelineJobId = priorWorkflow?.pipelineJobId || reg.start({
      pipeline: workflow.parsed?.intent || 'workflow',
      project: 'PURPCLAW',
      lane: 'Orchestrator',
      trigger: workflow.source || 'orchestrator',
      risk: workflow.priority === 'urgent' ? 'high' : 'low',
      inputs: { command: String(workflow.command || '').slice(0, 200) },
    }).job_id;
  } catch (_) { /* spine optional */ }

  log(`Starting workflow ${workflowId}: ${workflow.parsed.intent} from ${workflow.source}`);

  // Publish workflow started event
  await publishEvent('orchestrator.workflow.started', {
    workflowId,
    intent: workflow.parsed.intent,
    target: workflow.parsed.target,
    source: workflow.source,
    priority: workflow.priority
  });

  // Execute through pipeline
  try {
    // Stage 1: Parse
    workflow.status = 'routing';
    if (HIVEMIND) { try { HIVEMIND.recordWorkflowStage(workflow, 'parse', { parsed: workflow.parsed }); } catch (_) {} }
    const validated = validateCommand(workflow.parsed);

    if (!validated.valid) {
      throw new Error(validated.errors.join(', '));
    }

    // Stage 2: Route & Validate
    workflow.status = 'executing';
    workflow.steps.total = workflow.parsed.useTeam ? 3 : 2;
    if (HIVEMIND) { try { HIVEMIND.recordWorkflowStage(workflow, 'route', { intent: workflow.parsed.intent, target: workflow.parsed.target }); } catch (_) {} }

    await executeWorkflowSteps(workflow);
    if (HIVEMIND) { try { HIVEMIND.recordWorkflowStage(workflow, 'execute', { status: workflow.status }); } catch (_) {} }

  } catch (e) {
    workflow.error = e.message;
    workflow.status = 'failed';
    const failedAgent = workflow.agentId?.split('-')[0] || workflow._retryAgent || workflow.parsed?.intent || 'unknown';
    const failures = selfHealer.recordFailure(workflowId, failedAgent);
    workflow.retryCount = failures;

    if (selfHealer.shouldRetry(workflowId)) {
      const backoff = selfHealer.getBackoff(workflowId);
      workflow.status = 'retrying';

      // Context-aware retry: pick a different agent
      const intent = workflow.parsed?.intent || 'general';
      const newAgent = selfHealer.getRetryAgent(workflowId, intent);
      workflow._retryAgent = newAgent;

      log(`[SCORE] Retrying workflow ${workflowId} with ${newAgent} in ${backoff}ms (attempt ${workflow.retryCount})`);
      setTimeout(() => executeWorkflow(workflowId, workflowInput), backoff);
      return workflow;
    }
  }

  const duration = Date.now() - toTimestampMs(workflow.startTime, startTime);

  // Complete or fail
  if (workflow.status !== 'failed') {
    await completeWorkflow(workflowId, duration);
  } else {
    await failWorkflow(workflowId, duration);
  }

  // Update metrics
  updateMetrics(workflow, duration);

  return workflow;
}

async function executeWorkflowSteps(workflow) {
  const { parsed } = workflow;

  switch (parsed.intent) {
    case 'status':
      workflow.result = await getSystemStatus();
      workflow.status = 'completed';
      break;

    case 'swarm_status':
      workflow.result = await getSwarmStatus();
      workflow.status = 'completed';
      break;

    case 'swarm_mission':
      // Pass the FULL original command, not parsed.target — the command parser
      // extracts only a short fragment (e.g. "tools live"), which strips the
      // actual instruction ("create SWARM_PROOF.txt containing ...") and leaves
      // the agent to hallucinate. The swarm needs the complete task.
      workflow.result = await dispatchSwarmMission(workflow.command || parsed.target, workflow);
      workflow.status = 'completed';
      break;

    case 'list_agents':
      workflow.result = await listAgents();
      workflow.status = 'completed';
      break;

    case 'list_tasks':
      workflow.result = await listTasks();
      workflow.status = 'completed';
      break;

    case 'kill':
    case 'stop':
      workflow.result = await killTarget(parsed.target);
      workflow.status = 'completed';
      break;

    case 'search':
      workflow.result = await executeSearch(parsed.target);
      workflow.status = 'completed';
      break;

    case 'open':
      workflow.result = await openTarget(parsed.target);
      workflow.status = 'completed';
      break;

    case 'general':
    default:
      // All free-form/agentic work routes through the PROVEN swarm pipeline
      // (coordinator → tower → agent with real tool execution). The old
      // spawnAgent/spawnTeam branches returned undefined and did no real work,
      // and intent classification is phrasing-dependent (e.g. "build", "general"),
      // so unifying here makes every task command behave consistently. Pass the
      // FULL command, not parsed.target (which strips the actual instruction).
      workflow.result = await dispatchSwarmMission(workflow.command || parsed.target, workflow);
      workflow.status = 'completed';
      break;
  }
}

async function completeWorkflow(workflowId, duration) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  workflow.status = 'completed';
  workflow.endTime = new Date().toISOString();
  workflow.duration = duration;

  SWARM_MEMORY.session.completedTasks++;

  // ── Pipeline spine: prove + remember (writes a proof-ledger row). ──────
  try {
    if (workflow.pipelineJobId) require('./lib/pipeline-registry').finish(workflow.pipelineJobId, {
      status: 'complete',
      claim: `workflow ${workflow.parsed?.intent || ''} completed in ${duration}ms`,
      proof: { result: 'pass', detail: `${duration}ms` },
      output: typeof workflow.result === 'string' ? workflow.result.slice(0, 120) : '',
    });
  } catch (_) {}

  await publishEvent('orchestrator.workflow.completed', {
    workflowId,
    status: 'completed',
    result: workflow.result,
    duration
  });

  log(`Workflow ${workflowId} completed in ${duration}ms: ${workflow.result?.substring?.(0, 80) || workflow.result}`);

  if (HIVEMIND) {
    try {
      const trace = HIVEMIND.finishWorkflowTrace(workflow, { outcome: 'success', duration_ms: duration });
      if (trace) workflow.hivemindTrace = { run_id: trace.run_id, score: trace.score, outcome: trace.outcome };
    } catch (e) {
      workflow.hivemindFinishError = e.message;
      log(`[HIVEMIND] finish failed for ${workflowId}: ${e.message}`);
    }
  }

  // Stream result if needed
  if (workflow.streamId && activeStreams.has(workflow.streamId)) {
    streamResult(workflow.streamId, { type: 'completed', workflow });
  }

  // Move to completed (keep for 5 min for debugging)
  activeWorkflows.delete(workflowId);
  completedWorkflows.set(workflowId, workflow);
  selfHealer.clearFailure(workflowId);
  setTimeout(() => completedWorkflows.delete(workflowId), 300000);

  // Record task outcome for agent scoring
  if (agentScore) {
    agentScore.recordTask(
      workflow.agentId?.split('-')[0] || 'unknown',
      workflow.parsed?.intent || 'general',
      true,
      duration
    );
  }

  // ── Close the cognitive loop: ingest outcome to spine ──
  // Guard: JSON.stringify(undefined) returns undefined (not a string), so an
  // undefined/empty result would throw on .substring. Coerce to a string first.
  const outcome = (typeof workflow.result === 'string'
    ? workflow.result
    : (JSON.stringify(workflow.result) || '')).substring(0, 500);
  spineRequest('POST', '/memory/ingest', {
    content: `Task: ${workflow.parsed?.intent} ${workflow.parsed?.target}\nAgent: ${workflow.agentId?.split('-')[0] || 'unknown'}\nStatus: completed\nResult: ${outcome}`,
    type: 'task_result',
    valence: 0.7,
    source: 'orchestrator',
    importance: 0.65,
  }).catch(() => {});  // fire-and-forget, non-fatal
  // ── end outcome ingestion ──
}

async function failWorkflow(workflowId, duration) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  workflow.status = 'failed';
  workflow.endTime = new Date().toISOString();
  workflow.duration = duration;

  SWARM_MEMORY.session.failedTasks++;

  // ── Pipeline spine: record the failure (no fake green). ──────
  try {
    if (workflow.pipelineJobId) require('./lib/pipeline-registry').finish(workflow.pipelineJobId, {
      status: 'failed',
      claim: `workflow ${workflow.parsed?.intent || ''} failed: ${String(workflow.error || '').slice(0, 100)}`,
      proof: { result: 'fail', detail: String(workflow.error || '').slice(0, 120) },
    });
  } catch (_) {}

  await publishEvent('orchestrator.workflow.failed', {
    workflowId,
    error: workflow.error,
    duration
  });

  log(`Workflow ${workflowId} FAILED after ${duration}ms: ${workflow.error}`);

  if (HIVEMIND) {
    try {
      const trace = HIVEMIND.finishWorkflowTrace(workflow, { outcome: 'failed', duration_ms: duration, error: workflow.error });
      if (trace) workflow.hivemindTrace = { run_id: trace.run_id, score: trace.score, outcome: trace.outcome };
    } catch (e) {
      workflow.hivemindFinishError = e.message;
      log(`[HIVEMIND] failure trace failed for ${workflowId}: ${e.message}`);
    }
  }

  if (workflow.streamId && activeStreams.has(workflow.streamId)) {
    streamResult(workflow.streamId, { type: 'failed', error: workflow.error });
  }

  activeWorkflows.delete(workflowId);
  completedWorkflows.set(workflowId, workflow);
  selfHealer.clearFailure(workflowId);
  setTimeout(() => completedWorkflows.delete(workflowId), 300000);

  // Record task failure for agent scoring
  if (agentScore) {
    agentScore.recordTask(
      workflow.agentId?.split('-')[0] || 'unknown',
      workflow.parsed?.intent || 'general',
      false,
      duration
    );
  }

  // ── Close the cognitive loop: ingest failure to spine ──
  spineRequest('POST', '/memory/ingest', {
    content: `Task: ${workflow.parsed?.intent} ${workflow.parsed?.target}\nAgent: ${workflow.agentId?.split('-')[0] || 'unknown'}\nStatus: failed\nError: ${(workflow.error || 'unknown').substring(0, 300)}`,
    type: 'task_result',
    valence: -0.5,
    source: 'orchestrator',
    importance: 0.7,
  }).catch(() => {});  // fire-and-forget, non-fatal
  // ── end failure ingestion ──
}

function handleWorkflowFailure(workflowId, error) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  const failedAgent = workflow.agentId?.split('-')[0] || 'unknown';
  const intent = workflow.parsed?.intent || 'general';

  // Record failure with the agent that failed
  selfHealer.recordFailure(workflowId, failedAgent);

  // Mark this agent as failed in agent_score too
  if (agentScore) {
    agentScore.recordTask(failedAgent, intent, false, 0);
  }

  workflow.error = error;
  workflow.status = 'failed';

  if (selfHealer.shouldRetry(workflowId)) {
    const backoff = selfHealer.getBackoff(workflowId);
    workflow.retryCount++;

    // Context-aware retry: use a different agent
    const newAgent = selfHealer.getRetryAgent(workflowId, intent);
    log(`[SCORE] Retrying ${workflowId} with ${newAgent} (was ${failedAgent}) in ${backoff}ms - attempt ${workflow.retryCount}`);

    // Create a retry input that includes the agent override
    const retryInput = {
      command: workflow.command,
      source: workflow.source,
      _retryAgent: newAgent  // Override agent selection
    };

    setTimeout(() => executeWorkflow(workflowId, retryInput), backoff);
  } else {
    failWorkflow(workflowId, Date.now() - new Date(workflow.startTime).getTime());
  }
}

function broadcastProgress(workflowId, progress) {
  if (activeStreams.has(workflowId)) {
    streamResult(workflowId, { type: 'progress', progress });
  }
}

// ========== AGENT/TEAM SPAWNING ==========


// ── /api/orchestrate/await — synchronous wrapper for the harness ──
async function handleOrchestrateAwait(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { agentName, task, options } = JSON.parse(body);
      if (!agentName || !task) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'agentName and task required' }));
        return;
      }
      // Use the existing /api/spawn/await path internally — it already runs the agent
      // to completion and returns { success, output, ... } synchronously.
      const result = await dispatchSync(agentName, task, options || {});
      res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
  });
}

// ── Re-dispatch to the tower's /api/spawn/await (synchronous spawn path) ──
async function dispatchSync(agentName, task, options) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ agentName, task, options });
    const req = http.request({
      hostname: '127.0.0.1', port: 7790, path: '/api/spawn/await', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      timeout: 120_000,
    }, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ success: false, error: 'invalid response' }); }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
    req.write(data); req.end();
  });
}

async function spawnAgent(intent, target, workflow = null) {
  const agents = AGENT_BY_INTENT[intent] || [intent];

  // Context-aware retry: use the agent suggested by selfHealer.getRetryAgent()
  let agentName = null;
  if (workflow?._retryAgent && agents.includes(workflow._retryAgent)) {
    agentName = workflow._retryAgent;
    log(`[SCORE] Retry override: using ${agentName} for ${intent}`);
  } else if (agentScore) {
    // Use agent scoring for smart routing if available
    const suggested = agentScore.suggestAgent(intent);
    if (suggested && agents.includes(suggested)) {
      agentName = suggested;
      log(`[SCORE] Using scored agent ${agentName} for ${intent}`);
    } else {
      agentName = agentPool.getLeastLoaded() || agents[0];
    }
  } else {
    agentName = agentPool.getLeastLoaded() || agents[0];
  }

  agentPool.register(agentName);
  agentPool.markBusy(agentName);

  const taskDesc = `${intent} ${target}`;

  // ── Cognitive spine enrichment: fire 3 calls in parallel before spawning ──
  const [memoryResult, rulesResult, diagResult] = await Promise.all([
    spineRequest('POST', '/memory/recall', { query: `${intent} ${target}`, limit: 3 }),
    spineRequest('GET', '/rules/facts'),
    spineRequest('POST', '/diagnostics/diagnose', { agent: intent }),
  ]);

  const cognitiveContext = {
    recalled: memoryResult.results || [],
    facts: rulesResult.facts || [],
    diagnosis: diagResult.findings || [],
    routed_via: 'cognitive_spine_v1',
  };

  log(`[SPINE] enriched ${intent}/${target}: ${cognitiveContext.recalled.length} memories, ${cognitiveContext.facts.length} facts`);
  // ── end cognitive enrichment ──

  try {
    const result = await towerRequest('POST', '/api/spawn', {
      agentName,
      task: taskDesc,
      cognitiveContext,  // enriched context from spine
    });

    if (result.success) {
      await updateState('agents', result.agent?.id, {
        name: agentName,
        task: taskDesc,
        status: 'running',
        startTime: new Date().toISOString(),
        intent
      });

      await publishEvent('orchestrator.agent.spawned', {
        workflowId: null,
        agentName,
        task: taskDesc,
        agentId: result.agent?.id
      });

      agentPool.markAvailable(agentName);

      return {
        success: true,
        agentId: result.agent?.id,
        response: `${getAgentEmoji(agentName)} ${agentName.toUpperCase()} working on: ${target}`
      };
    } else {
      agentPool.markAvailable(agentName);
      return { success: false, error: result.error || 'Spawn failed' };
    }
  } catch (e) {
    agentPool.markAvailable(agentName);
    return { success: false, error: e.message };
  }
}

async function spawnTeam(intent, target) {
  const template = TEAM_TEMPLATES[intent];
  if (!template) {
    return { success: false, error: `No team template for ${intent}` };
  }

  // Register all team members
  template.members.forEach(m => agentPool.register(m));
  template.members.forEach(m => agentPool.markBusy(m));

  try {
    const result = await towerRequest('POST', '/api/team/spawn', {
      name: `${template.description} Team`,
      leader: template.leader,
      members: template.members,
      task: `${intent} ${target}`
    });

    if (result.success) {
      await updateState('teams', result.team?.id, {
        name: `${template.description} Team`,
        leader: template.leader,
        members: template.members,
        task: target,
        status: 'active',
        startTime: new Date().toISOString()
      });

      await publishEvent('orchestrator.team.spawned', {
        teamId: result.team?.id,
        leader: template.leader,
        members: template.members,
        task: target
      });

      // Mark agents available after a delay (simulating work time)
      setTimeout(() => {
        template.members.forEach(m => agentPool.markAvailable(m));
      }, 30000);

      const memberEmojis = template.members.map(m => getAgentEmoji(m)).join('');
      return {
        success: true,
        teamId: result.team?.id,
        response: `Team deployed. ${getAgentEmoji(template.leader)} leading ${memberEmojis} on ${target}`
      };
    } else {
      template.members.forEach(m => agentPool.markAvailable(m));
      return { success: false, error: result.error };
    }
  } catch (e) {
    template.members.forEach(m => agentPool.markAvailable(m));
    return { success: false, error: e.message };
  }
}

function getAgentEmoji(name) {
  const emojis = {
    wolf: '🐺', dragon: '🐉', robot: '🤖', bee: '🐝', cactus: '🌵',
    rabbit: '🐰', mushroom: '🍄', penguin: '🐧', duck: '🦆', spider: '🕷️',
    raven: '🐦‍⬛', owl: '🦉', ghost: '👻', snake: '🐍', turtle: '🐢',
    octopus: '🐙', hawk: '🦅', chonk: '🐈', fox: '🦊', axolotl: '🦎',
    void: '🕳️', guardian: '🛡️', gorilla: '🦍', shark: '🦈', goose: '🪿',
    parrot: '🦜', phoenix: '🔥', panda: '🐼', bunny: '🐰', mantis: '🪲',
    karen: '💅', lemur: '🦝', elephant: '🐘', scientist: '🔬',
    crow: '🐦', goat: '🐐', tiger: '🐯',
  };
  return emojis[name.toLowerCase()] || '🤖';
}

// ========== SYSTEM QUERIES ==========

async function getSystemStatus() {
  try {
    const [apiHealth, towerHealth, voiceHealth, stateHealth] = await Promise.all([
      fetch('http://localhost:7780/api/health').catch(() => ({ ok: false })),
      fetch('http://localhost:7790/tower/status').catch(() => ({ ok: false })),
      fetch('http://localhost:7781/health').catch(() => ({ ok: false })),
      fetch('http://localhost:7783/health').catch(() => ({ ok: false }))
    ]);

    const services = {
      api: apiHealth.ok ? 'healthy' : 'down',
      tower: towerHealth.ok ? 'healthy' : 'down',
      voice: voiceHealth.ok ? 'healthy' : 'down',
      state: stateHealth.ok ? 'healthy' : 'down'
    };

    const healthyCount = Object.values(services).filter(s => s === 'healthy').length;

    return {
      services,
      overall: healthyCount === 4 ? 'fully operational' : `${healthyCount}/4 healthy`,
      agentPool: agentPool.getStats(),
      queueDepth: taskQueue.size()
    };
  } catch (e) {
    return { error: e.message };
  }
}

const COORDINATOR_PORT = parseInt(process.env.COORDINATOR_PORT || '7898', 10);

async function dispatchSwarmMission(task, workflow) {
  // Hard ceiling so a stuck coordinator can never hang the whole workflow
  // (and thus the CLI) forever. A real mission completes in well under this.
  const ac = new AbortController();
  const killer = setTimeout(() => ac.abort(), 5 * 60 * 1000);
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${COORDINATOR_PORT}/api/coordinate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task,
        workflowId: workflow?.id,
        intent: 'swarm_mission',
        options: {
          urgent: workflow?.parsed?.urgent || false,
          hivemind: workflow?.hivemind ? {
            traceId: workflow.hivemindTraceId || null,
            skills: workflow.hivemindSkills || [],
            antiskills: workflow.hivemindAntiSkills || [],
            promptBlock: workflow.hivemind.promptBlock || ''
          } : null
        }
      }),
      signal: ac.signal
    });
  } catch (e) {
    clearTimeout(killer);
    throw new Error(e.name === 'AbortError' ? 'Swarm mission timed out (coordinator did not respond in 5m)' : `Swarm dispatch failed: ${e.message}`);
  }
  clearTimeout(killer);
  const result = await res.json();

  await publishEvent('orchestrator.swarm.mission', {
    workflowId: workflow?.id,
    missionId: result.missionId,
    success: result.success
  });

  if (!result.success) {
    throw new Error(result.error || `Swarm mission ${result.missionId || ''} failed`);
  }
  return result;
}

async function getSwarmStatus() {
  try {
    const status = await towerRequest('GET', '/tower/status');
    const active = status?.activeAgents?.length || 0;
    const teams = status?.teams?.length || 0;
    return {
      activeAgents: active,
      activeTeams: teams,
      queueDepth: taskQueue.size(),
      completedTasks: SWARM_MEMORY.session.completedTasks,
      failedTasks: SWARM_MEMORY.session.failedTasks
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function listAgents() {
  try {
    const status = await towerRequest('GET', '/tower/status');
    if (status?.registeredAgents) {
      const available = Array.from(agentPool.available.keys());
      const agents = status.registeredAgents.map(a => ({
        ...a,
        available: available.includes(a.name)
      }));
      return agents;
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function listTasks() {
  const active = Array.from(activeWorkflows.values()).map(w => ({
    id: w.id,
    intent: w.parsed.intent,
    target: w.parsed.target,
    status: w.status,
    startTime: w.startTime
  }));

  const queued = taskQueue.items.map(i => ({
    command: i.command?.substring(0, 50),
    priority: i._priority
  }));

  return { active, queued, counts: { active: active.length, queued: queued.length } };
}

function workflowSummary(workflow) {
  if (!workflow) return null;
  const result = typeof workflow.result === 'string'
    ? workflow.result
    : workflow.result
      ? JSON.stringify(workflow.result)
      : null;
  return {
    id: workflow.id,
    intent: workflow.parsed?.intent || workflow.intent || 'unknown',
    target: workflow.parsed?.target || workflow.target || workflow.command || '',
    command: workflow.command,
    status: workflow.status,
    startTime: workflow.startTime,
    endTime: workflow.endTime,
    duration: workflow.duration,
    steps: workflow.steps || { total: 0, completed: 0 },
    source: workflow.source,
    priority: workflow.priority,
    agentId: workflow.agentId || null,
    teamId: workflow.teamId || null,
    streamId: workflow.streamId || null,
    result: result ? result.substring(0, 1200) : null,
    error: workflow.error || null,
    retryCount: workflow.retryCount || 0
  };
}

function getPipelineSnapshot() {
  const active = Array.from(activeWorkflows.values()).map(workflowSummary).filter(Boolean);
  const completed = Array.from(completedWorkflows.values())
    .map(workflowSummary)
    .filter(Boolean)
    .sort((a, b) => new Date(b.endTime || b.startTime || 0) - new Date(a.endTime || a.startTime || 0));
  const items = taskQueue.items.map(i => ({
    command: i.command?.substring(0, 160),
    priority: i._priority,
    enqueuedAt: i._enqueuedAt ? new Date(i._enqueuedAt).toISOString() : null
  }));
  return {
    active,
    completed,
    queue: { depth: taskQueue.size(), items },
    metrics: {
      total: SWARM_MEMORY.session.totalTasks,
      completed: SWARM_MEMORY.session.completedTasks,
      failed: SWARM_MEMORY.session.failedTasks,
      avgResponseTime: SWARM_MEMORY.metrics.avgResponseTime || 0
    }
  };
}

async function waitForWorkflowCompletion(workflowId, timeoutMs = 10 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const completed = completedWorkflows.get(workflowId);
    if (completed) return completed;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const workflow = activeWorkflows.get(workflowId);
  if (workflow) {
    workflow.status = 'failed';
    workflow.error = `Workflow ${workflowId} did not complete within ${timeoutMs}ms`;
    await failWorkflow(workflowId, Date.now() - new Date(workflow.startTime).getTime());
    const completed = completedWorkflows.get(workflowId);
    if (completed) return completed;
  }

  throw new Error(`Workflow ${workflowId} did not complete within ${timeoutMs}ms`);
}

async function killTarget(target) {
  try {
    await towerRequest('POST', '/api/kill', { agentName: target });
    return `Stopping ${target}.`;
  } catch (e) {
    return `Failed to stop ${target}.`;
  }
}

async function executeSearch(query) {
  try {
    const result = await apiRequest('POST', '/api/execute', {
      tool: 'file_search',
      args: { path: 'C:\\Users\\Admin\\Desktop', query, in_content: true }
    });
    return result.content?.[0]?.text || `Searched for: ${query}`;
  } catch (e) {
    return `Search failed: ${e.message}`;
  }
}

async function openTarget(target) {
  try {
    const result = await apiRequest('POST', '/api/execute', {
      tool: 'open_application',
      args: { app_name: target }
    });
    return result.content?.[0]?.text || `Opened: ${target}`;
  } catch (e) {
    return `Failed to open ${target}.`;
  }
}

async function executeGeneralTask(task) {
  const lower = task.toLowerCase();

  let intent = 'general';
  if (lower.includes('build') || lower.includes('create') || lower.includes('make')) intent = 'build';
  else if (lower.includes('fix') || lower.includes('repair')) intent = 'fix';
  else if (lower.includes('test')) intent = 'test';
  else if (lower.includes('analyze')) intent = 'analyze';
  else if (lower.includes('research')) intent = 'research';

  const result = await spawnAgent(intent, task);
  return result.response || result.error || `Working on: ${task}`;
}

// ========== STREAMING ==========

function createStream(workflowId) {
  const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  activeStreams.set(streamId, workflowId);
  return streamId;
}

function streamResult(streamId, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  // Broadcast to all SSE clients
  for (const client of sseClients) {
    try {
      if (client.writable && !client.headersSent) {
        client.write(payload);
      }
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// ========== METRICS ==========

function updateMetrics(workflow, duration) {
  // Update average response time
  const currentAvg = SWARM_MEMORY.metrics.avgResponseTime;
  const completedCount = SWARM_MEMORY.session.completedTasks;
  SWARM_MEMORY.metrics.avgResponseTime = (currentAvg * (completedCount - 1) + duration) / completedCount;

  // Track by intent
  if (!SWARM_MEMORY.metrics.byIntent[workflow.parsed.intent]) {
    SWARM_MEMORY.metrics.byIntent[workflow.parsed.intent] = { count: 0, totalDuration: 0 };
  }
  SWARM_MEMORY.metrics.byIntent[workflow.parsed.intent].count++;
  SWARM_MEMORY.metrics.byIntent[workflow.parsed.intent].totalDuration += duration;
}

function getMetrics() {
  return {
    swarm: SWARM_MEMORY,
    agentPool: agentPool.getStats(),
    workflows: {
      active: activeWorkflows.size,
      completed: completedWorkflows.size,
      queueDepth: taskQueue.size()
    },
    uptime: process.uptime(),
    hivemind: HIVEMIND ? { status: HIVEMIND.status(), spring: HIVEMIND.springStatus() } : { ok: false }
  };
}

// ========== SSE BROADCAST ==========

function broadcastToClients(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      // Guard: only write if headers haven't been sent (not ended, not a regular HTTP response)
      if (client.writable && !client.headersSent) {
        client.write(payload);
      } else {
        // Dead client — remove it to prevent repeated failures
        sseClients.delete(client);
      }
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// ========== HTTP SERVER ==========

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${ORCHESTRATOR_PORT}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'orchestrator',
        port: ORCHESTRATOR_PORT,
        uptime: process.uptime()
      }));
      return;
    }

    // SSE stream
    if (url.pathname === '/api/stream') {
      // Guard against double-init (client reconnect, stale entry)
      if (res.headersSent || res.writableEnded) return;
      try {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        sseClients.add(res);
        const ack = res.write('data: {"type":"connected","service":"orchestrator"}\n\n');
        if (!ack) {
          // TCP backpressure — client window full, remove immediately
          sseClients.delete(res);
        }
      } catch (e) {
        sseClients.delete(res);
      }

      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Orchestrate command
    if (url.pathname === '/api/orchestrate/await' && req.method === 'POST') { return handleOrchestrateAwait(req, res); } else     if (url.pathname === '/api/orchestrate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { command, urgent, stream, wait } = JSON.parse(body);
          const streamId = stream ? createStream(workflowIdCounter.toString()) : null;
          const workflowId = `wf-${Date.now()}-${workflowIdCounter++}`;

          const runner = executeWorkflow(workflowId, { command, urgent, streamId })
            .catch(async e => {
              log(`Workflow ${workflowId} execution error: ${e.message}`);
              const workflow = activeWorkflows.get(workflowId);
              if (workflow) {
                workflow.status = 'failed';
                workflow.error = e.message;
                await failWorkflow(workflowId, Date.now() - new Date(workflow.startTime).getTime());
              }
            });

          if (wait) {
            // Legacy blocking mode: caller explicitly wants the final result.
            await runner;
            const result = await waitForWorkflowCompletion(workflowId);
            if (res.headersSent || res.writableEnded) return;
            res.writeHead(result.status === 'failed' ? 500 : 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ workflowId, status: result.status, streamId, result: workflowSummary(result) }));
          } else {
            // Default: fire-and-forget. Respond INSTANTLY with the workflowId; the
            // mission runs in the background and progress streams live over SSE
            // (/api/stream). This stops the UI from "feeling hung" for minutes on
            // a synchronous wait — the swarm is working, you just see it live now.
            if (res.headersSent || res.writableEnded) return;
            res.writeHead(202, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ workflowId, status: 'running', streamId, async: true }));
          }
        } catch (e) {
          if (res.headersSent || res.writableEnded) return;
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Enqueue workflow (for async processing)
    if (url.pathname === '/api/enqueue' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { command, priority, urgent } = JSON.parse(body);
          const queuePos = enqueueWorkflow({ command, priority, urgent });

          res.writeHead(202, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ accepted: true, queuePosition: queuePos }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Pipeline snapshot for cockpit ribbons.
    if (url.pathname === '/api/pipeline' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(getPipelineSnapshot()));
      return;
    }

    // Get active workflows
    if (url.pathname === '/api/workflows' && req.method === 'GET') {
      const workflows = Array.from(activeWorkflows.values()).map(w => ({
        id: w.id,
        intent: w.parsed.intent,
        target: w.parsed.target,
        status: w.status,
        startTime: w.startTime,
        steps: w.steps
      }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(workflows));
      return;
    }

    // Get specific workflow
    if (url.pathname.match(/^\/api\/workflow\/([^/]+)$/) && req.method === 'GET') {
      const workflowId = url.pathname.match(/^\/api\/workflow\/([^/]+)$/)[1];
      const workflow = activeWorkflows.get(workflowId) || completedWorkflows.get(workflowId);
      if (workflow) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(workflow));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Workflow not found' }));
      }
      return;
    }

    // Status summary
    if (url.pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(getMetrics()));
      return;
    }

    // Hivemind runtime API — file-backed, no extra daemon.
    if (url.pathname === '/api/hivemind/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(HIVEMIND ? HIVEMIND.status() : { ok: false, error: 'hivemind unavailable' }));
      return;
    }

    if (url.pathname === '/api/hivemind/spring' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(HIVEMIND ? HIVEMIND.springStatus() : { ok: false, error: 'hivemind unavailable' }));
      return;
    }
    if (url.pathname === '/api/hivemind/doctrine' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(HIVEMIND ? HIVEMIND.listDoctrines() : []));
      return;
    }
    if (url.pathname === '/api/hivemind/principles' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(HIVEMIND ? HIVEMIND.listPrinciples() : []));
      return;
    }
    if (url.pathname === '/api/hivemind/validate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const result = HIVEMIND ? HIVEMIND.validateRecord(payload.record || payload, payload.rules || {}) : { error: 'hivemind unavailable' };
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/hivemind/skills' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(HIVEMIND ? HIVEMIND.listSkills({ includeDeprecated: url.searchParams.get('all') === '1' }) : []));
      return;
    }
    if (url.pathname === '/api/hivemind/traces' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(HIVEMIND ? HIVEMIND.listTraces(limit) : []));
      return;
    }
    if (url.pathname === '/api/hivemind/load' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const ctx = HIVEMIND ? HIVEMIND.loadRuntimeContext(payload.task || '', payload.options || {}) : null;
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(ctx || { skills: [], antiskills: [], promptBlock: '' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    if (url.pathname === '/api/hivemind/promote' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const result = HIVEMIND ? HIVEMIND.promote(payload) : { error: 'hivemind unavailable' };
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Queue status
    if (url.pathname === '/api/queue' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        depth: taskQueue.size(),
        items: taskQueue.items.map(i => ({
          command: i.command?.substring(0, 50),
          priority: i._priority,
          enqueuedAt: new Date(i._enqueuedAt).toISOString()
        }))
      }));
      return;
    }

    // Memory context
    if ((url.pathname === '/api/memory' || url.pathname === '/api/swarm/memory') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(SWARM_MEMORY));
      return;
    }

    // Swarm memory update
    if (url.pathname === '/api/memory' && req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const update = JSON.parse(body);
          Object.assign(SWARM_MEMORY.context, update);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Agent pool status
    if (url.pathname === '/api/agents' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        pool: agentPool.getStats(),
        available: Array.from(agentPool.available.entries()).map(([name, info]) => ({ name, ...info })),
        busy: Array.from(agentPool.busy.entries()).map(([name, info]) => ({ name, ...info }))
      }));
      return;
    }

    // Pool alias — same as /api/agents
    if ((url.pathname === '/api/pool' || url.pathname === '/api/pool/status') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(agentPool.getStats()));
      return;
    }

    // Swarm status summary
    if (url.pathname === '/api/swarm/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        session: SWARM_MEMORY.session,
        metrics: SWARM_MEMORY.metrics,
        workflows: { active: activeWorkflows.size, completed: completedWorkflows.size },
        agents: {
          alive: SWARM_MEMORY.context.activeAgents.length,
          ttlMs: AGENT_HEARTBEAT_TTL_MS,
          cleanupIntervalMs: AGENT_TTL_CLEANUP_INTERVAL_MS
        }
      }));
      return;
    }

    // Clear zombie agents from activeAgents list
    if (url.pathname === '/api/swarm/agents' && req.method === 'DELETE') {
      const { cleared, remaining } = pruneDeadAgents();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ cleared, remaining }));
      return;
    }

    // Agent heartbeat ping — refreshes TTL without re-adding the agent
    if (url.pathname.match(/^\/api\/swarm\/agents\/([^/]+)\/heartbeat$/) && req.method === 'PUT') {
      const agentId = url.pathname.match(/^\/api\/swarm\/agents\/([^/]+)\/heartbeat$/)[1];
      const idx = SWARM_MEMORY.context.activeAgents.findIndex(a => a.agentId === agentId);
      if (idx !== -1) {
        SWARM_MEMORY.context.activeAgents[idx].lastHeartbeat = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, agentId, lastHeartbeat: SWARM_MEMORY.context.activeAgents[idx].lastHeartbeat }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'agent not found', agentId }));
      }
      return;
    }

    // System manifest (aggregated from all services)
    if ((url.pathname === '/api/manifest' || url.pathname === '/api/system/manifest') && req.method === 'GET') {
      try {
        const manifest = require('./lib/system-manifest.js');
        const data = manifest.getManifest(new Date().toISOString());
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ service: 'orchestrator', version: '2.0', error: e.message }));
      }
      return;
    }

    // ── Phase Three: Runtime Truth Ledger ────────────────────────────────────
    // GET /api/system/health
    // Per-subsystem honest status: online | degraded | offline | unknown + reason.
    // Probes all 25 PM2 services + key non-PM2 endpoints.
    // This is the ONLY endpoint the UI should trust for service state.
    if (url.pathname === '/api/system/health' && req.method === 'GET') {
      const { execSync } = require('child_process');

      // ── PM2 truth ──────────────────────────────────────────────────────────
      let pm2Truth = [];
      try {
        pm2Truth = JSON.parse(execSync('pm2 jlist --no-color', { timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
      } catch (e) {
        pm2Truth = [];
      }
      const pm2ByName = {};
      for (const p of pm2Truth) pm2ByName[p.name] = p;

      // ── All 25 PM2 services (from ecosystem.config.js) ─────────────────────
      // Port corrections discovered via source audit (2026-06-19):
      //   purpclaw-coordinator  → 7898 (was 7781, wrong — 7781 is voice TCP)
      //   purpclaw-voice        → health on 8781 (7781+1000, was probing TCP port)
      //   purpclaw-telegram     → 7795 (was 7777)
      //   purpclaw-vision       → 7788 (vision_monitor.js moved from 7781 — was conflicting with voice TCP)
      //   purpclaw-yolo        → Python --port 7779
      //   purpclaw-avatar      → Python --port 7777
      //   purpclaw-chorus       → companion-chorus bridge, default 7797
      const PM2_SERVICES = [
        { pm2Name: 'purpclaw-api',           port: 7780, healthPath: '/api/health',       class: 'core' },
        { pm2Name: 'purpclaw-orchestrator',  port: 7784, healthPath: '/api/health',       class: 'core' },
        { pm2Name: 'purpclaw-eventbus',       port: 7782, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-state',          port: 7783, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-tower',          port: 7790, healthPath: '/tower/health',     class: 'core' },
        { pm2Name: 'purpclaw-gatekeeper',     port: 7791, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-pool',            port: 7885, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-context',         port: 7881, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-cognitive',       port: 7880, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-metrics',         port: 7890, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-workers',         port: 7897, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-nextjs',          port: 3030, healthPath: '/',                 class: 'core' },
        { pm2Name: 'purpclaw-coordinator',     port: 7898, healthPath: '/health',           class: 'core' },
        { pm2Name: 'purpclaw-bridge',          port: 7792, healthPath: '/api/bridge/state', class: 'optional-dark' },
        { pm2Name: 'purpclaw-voice',           port: 8781, healthPath: '/health',            class: 'optional-dark' },
        { pm2Name: 'purpclaw-harness',         port: 7798, healthPath: '/health',           class: 'optional-dark' },
        { pm2Name: 'purpclaw-telegram',        port: 7795, healthPath: '/health',           class: 'optional-dark' },
        { pm2Name: 'purpclaw-chorus',          port: 7797, healthPath: '/',                 class: 'optional-dark' },  // no HTTP server — bridge is EventBus-only
        { pm2Name: 'purpclaw-vision',          port: 7788, healthPath: '/health',           class: 'optional-dark' },
        { pm2Name: 'purpclaw-reasoning',       port: 7892, healthPath: '/health',           class: 'optional-dark' },
        { pm2Name: 'purpclaw-voice-ingress',   port: 7896, healthPath: '/',                 class: 'optional-dark' },  // no HTTP server — connects STT → orchestrator via HTTP client
        { pm2Name: 'purpclaw-stt',             port: 7896, healthPath: '/health',           class: 'optional-dark' },
        { pm2Name: 'purpclaw-yolo',            port: 7779, healthPath: '/',                 class: 'optional-dark' },  // no /health — only POST /detect
        { pm2Name: 'purpclaw-avatar',          port: 7777, healthPath: '/',                 class: 'optional-dark' },  // no /health — only POST /command
        { pm2Name: 'purpclaw-thringlet',       port: 7799, healthPath: '/health',           class: 'optional-dark' },
      ];

      // ── Probe helpers ───────────────────────────────────────────────────────
      const TIMEOUT_MS = 3000;
      const DEGRADED_LATENCY_MS = 1500;
      // Rolling window: only flag restarts as degraded if they occurred recently.
      // Historical restarts (service running > 5 min without storm) are not degraded.
      const RESTART_STORM_WINDOW_SECS = 300;  // 5-minute rolling window
      const RESTART_STORM_THRESHOLD = 3;       // >3 restarts in window = degraded

      const httpProbe = (port, path) => new Promise((resolve) => {
        const start = Date.now();
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
        fetch(`http://127.0.0.1:${port}${path}`, { signal: controller.signal })
          .then(r => r.ok ? { ok: true, status: r.status, latencyMs: Date.now() - start }
            : { ok: false, status: r.status, latencyMs: Date.now() - start, error: `http_${r.status}` })
          .catch(e => ({ ok: false, error: e.name === 'AbortError' ? 'timeout' : e.code || e.message, latencyMs: Date.now() - start }))
          .finally(() => clearTimeout(t))
          .then(resolve);
      });

      // ── Compute per-subsystem status + reason ──────────────────────────────
      const getSubsystemStatus = (pm2Rec, httpRec, svc) => {
        const pm2Online = pm2Rec && pm2Rec.pm2_env?.status === 'online';
        const restarts = pm2Rec ? (pm2Rec.pm2_env?.restart_time || 0) : 0;
        const unstableRestarts = pm2Rec ? (pm2Rec.pm2_env?.unstable_restarts || 0) : 0;
        const latency = httpRec.latencyMs;

        if (!pm2Online && !httpRec.ok) {
          return { status: 'offline', reason: 'PM2 stopped, HTTP unreachable' };
        }
        if (!pm2Online && httpRec.ok) {
          return { status: 'offline', reason: `PM2 not running, HTTP responds at ${latency}ms (ghost)` };
        }
        if (pm2Online && !httpRec.ok) {
          return { status: 'offline', reason: httpRec.error === 'timeout' ? 'PM2 online, HTTP timed out' : `PM2 online, HTTP error: ${httpRec.error}` };
        }

        // PM2 online AND HTTP ok
        if (svc.pm2Name === 'purpclaw-bridge') {
          // Bridge state is reported via its own /api/bridge/state endpoint
          return { status: 'online', reason: `connected, HTTP ${latency}ms` };
        }
        // Rolling window: restarts only count as degraded if they occurred recently.
        // Stable long-running services (uptime > window) should not show as degraded
        // just because of old boot-time restarts.
        const uptimeSecs = pm2Rec && pm2Rec.pm2_env && pm2Rec.pm2_env.pm_uptime
          ? Math.floor((Date.now() - pm2Rec.pm2_env.pm_uptime) / 1000)
          : null;
        const windowSecs = RESTART_STORM_WINDOW_SECS;
        // "stale" restarts = total restarts accumulated before the window opened
        const staleRestarts = uptimeSecs !== null && uptimeSecs > windowSecs ? restarts : 0;
        const recentRestarts = restarts - staleRestarts;
        if (unstableRestarts > 0) {
          return { status: 'degraded', reason: `${unstableRestarts} unstable restarts` };
        }
        if (recentRestarts > RESTART_STORM_THRESHOLD) {
          return { status: 'degraded', reason: `${recentRestarts} restart${recentRestarts === 1 ? '' : 's'} in last ${windowSecs}s (${staleRestarts} stale)` };
        }
        if (latency > DEGRADED_LATENCY_MS) {
          return { status: 'degraded', reason: `slow response ${latency}ms` };
        }
        return { status: 'online', reason: restarts === 0 ? 'zero restarts' : `${restarts} restart${restarts === 1 ? '' : 's'}` };
      };

      // Probe all PM2 services in parallel
      const subsystemResults = await Promise.all(
        PM2_SERVICES.map(async (svc) => {
          const pm2 = pm2ByName[svc.pm2Name];
          const http = await httpProbe(svc.port, svc.healthPath);
          const { status, reason } = getSubsystemStatus(pm2, http, svc);

          return {
            subsystem: svc.pm2Name.replace('purpclaw-', ''),
            pm2Name: svc.pm2Name,
            port: svc.port,
            healthPath: svc.healthPath,
            class: svc.class,
            status,
            reason,
            latencyMs: http.latencyMs || null,
            httpOk: http.ok,
            httpStatus: http.status || null,
            pm2: pm2 ? {
              pid: pm2.pid,
              restarts: pm2.pm2_env?.restart_time || 0,
              unstableRestarts: pm2.pm2_env?.unstable_restarts || 0,
              uptime: pm2.pm2_env?.uptime || 0,
              cpu: pm2.monit?.cpu || 0,
              memory: pm2.monit?.memory || 0,
            } : null,
          };
        })
      );

      // ── Bridge deep-state: /api/bridge/state ───────────────────────────────
      let bridgeState = null;
      try {
        const bs = await httpProbe(7792, '/api/bridge/state');
        if (bs.ok) {
          try {
            const controller2 = new AbortController();
            const t2 = setTimeout(() => controller2.abort(), 2000);
            const raw = await fetch('http://127.0.0.1:7792/api/bridge/state', { signal: controller2.signal });
            bridgeState = await raw.json();
            clearTimeout(t2);
          } catch (_) {
            bridgeState = { state: 'unknown', reason: 'bridge responded but failed to parse' };
          }
        }
      } catch (_) { /* bridge offline */ }

      // ── TTS / Telegram token check ─────────────────────────────────────────
      const telegramTokenMissing = !process.env.TELEGRAM_BOT_TOKEN && !process.env.MINIMAX_TELEGRAM_BOT_TOKEN;

      // ── Swarm state ────────────────────────────────────────────────────────
      const now = Date.now();
      const zombieCount = SWARM_MEMORY.context.activeAgents.filter(a => a.ttl && a.ttl < now).length;
      const liveCount = SWARM_MEMORY.context.activeAgents.length;

      // ── Orchestrator self-state ────────────────────────────────────────────
      const orchRec = subsystemResults.find(s => s.pm2Name === 'purpclaw-orchestrator');
      const orchRestarts = orchRec?.pm2?.restarts || 0;
      const orchUptime = orchRec?.pm2?.uptime
        ? Math.floor((Date.now() - orchRec.pm2.uptime) / 1000)
        : Math.floor(process.uptime());

      // ── Summary counts ─────────────────────────────────────────────────────
      const online = subsystemResults.filter(r => r.status === 'online').length;
      const degraded = subsystemResults.filter(r => r.status === 'degraded').length;
      const offline = subsystemResults.filter(r => r.status === 'offline').length;

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
          total: subsystemResults.length,
          online,
          degraded,
          offline,
          // honest summary line for UI
          verdict: offline === 0
            ? degraded === 0
              ? 'all subsystems online'
              : `${degraded} subsystem${degraded === 1 ? '' : 's'} degraded`
            : `${offline} subsystem${offline === 1 ? '' : 's'} offline`,
        },
        orchestrator: {
          session: SWARM_MEMORY.session.id,
          uptimeSecs: orchUptime,
          restarts: orchRestarts,
          verdict: orchRestarts === 0 ? 'clean' : `${orchRestarts} restarts`,
          agents: { alive: liveCount },
          zombies: { count: zombieCount, verdict: zombieCount === 0 ? 'clean' : `${zombieCount} zombie${zombieCount === 1 ? '' : 's'}` },
          workflows: { active: activeWorkflows.size, completed: completedWorkflows.size },
        },
        tts: {
          status: telegramTokenMissing ? 'blocked' : 'ok',
          reason: telegramTokenMissing ? 'token rotation required' : 'token present',
        },
        bridge: bridgeState ? {
          status: bridgeState.state === 'connected' ? 'online' : bridgeState.state,
          reason: bridgeState.reason || bridgeState.state,
          controlAttempts: bridgeState.controlApiAttempts ?? 0,
        } : {
          status: subsystemResults.find(s => s.pm2Name === 'purpclaw-bridge')?.status || 'unknown',
          reason: subsystemResults.find(s => s.pm2Name === 'purpclaw-bridge')?.reason || 'bridge state endpoint unreachable',
        },
        subsystems: subsystemResults,
      }, null, 2));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(ORCHESTRATOR_PORT, () => {
    log(`═══════════════════════════════════════════════`);
    log(`PURPCLAW Orchestrator v2.0`);
    log(`═══════════════════════════════════════════════`);
    log(`Port: ${ORCHESTRATOR_PORT}`);
    log(`Features: Priority Queue, Self-Healing, Agent Pool`);
    log(`═══════════════════════════════════════════════`);
    log(`Ready for command orchestration`);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      log(`Port ${ORCHESTRATOR_PORT} in use`);
    }
  });

  return server;
}

// ========== INITIALIZATION ==========

async function init() {
  log('Initializing PURPCLAW Orchestrator v2.0...');
  log(`Swarm Memory Session: ${SWARM_MEMORY.session.id}`);

  // Start HTTP server
  startHttpServer();

  // Subscribe to EventBus topics
  await subscribeToEventBus('agent.*');
  await subscribeToEventBus('tool.*');
  await subscribeToEventBus('system.*');
  await subscribeToEventBus('voice.*');

  // Register all agents in pool
  for (const agents of Object.values(AGENT_BY_INTENT)) {
    agents.forEach(a => agentPool.register(a));
  }

  // Publish startup event
  await publishEvent('system.startup', {
    service: 'orchestrator',
    port: ORCHESTRATOR_PORT,
    version: '2.0'
  });

  log('═══════════════════════════════════════════════');
  log('PURPCLAW Orchestrator v2.0 - READY');
  log(`Queue: ${taskQueue.size()} pending | Agents: ${agentPool.getStats().total} registered`);
  log('═══════════════════════════════════════════════');
}

init().catch(e => {
  log('Fatal error during initialization:', e);
  process.exit(1);
});
