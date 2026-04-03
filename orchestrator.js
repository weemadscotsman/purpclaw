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

// Ports
const ORCHESTRATOR_PORT = 7784;
const EVENTBUS_PORT = 7782;
const STATE_PORT = 7783;
const API_PORT = 7780;
const TOWER_PORT = 7790;
const VOICE_COORD_PORT = 7781;

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
  { pattern: /swarm\s+status/i, intent: 'swarm_status', useTeam: false },
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
  }
};

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
      workflow.steps.completed++;
      workflow.result = event.output || 'Task completed';
      checkAndComplete(workflowId);
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
    SWARM_MEMORY.context.activeAgents = SWARM_MEMORY.context.activeAgents.filter(a => a.agentId !== data.agentId);
    if (data.type !== 'agent.failed') {
      SWARM_MEMORY.context.activeAgents.push(data);
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

  const workflow = {
    id: workflowId,
    command: workflowInput.command,
    source: workflowInput.source || 'api',
    parsed: parseCommand(workflowInput.command),
    status: 'parsing',
    priority: workflowInput.urgent ? 'urgent' : (workflowInput.priority || 'normal'),
    startTime: new Date().toISOString(),
    steps: { total: 0, completed: 0 },
    agentId: null,
    teamId: null,
    result: null,
    error: null,
    retryCount: 0,
    streamId: workflowInput.streamId
  };

  activeWorkflows.set(workflowId, workflow);
  SWARM_MEMORY.session.totalTasks++;

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
    const validated = validateCommand(workflow.parsed);

    if (!validated.valid) {
      throw new Error(validated.errors.join(', '));
    }

    // Stage 2: Route & Validate
    workflow.status = 'executing';
    workflow.steps.total = workflow.parsed.useTeam ? 3 : 2;

    await executeWorkflowSteps(workflow);

  } catch (e) {
    workflow.error = e.message;
    workflow.status = 'failed';

    if (selfHealer.shouldRetry(workflowId)) {
      const backoff = selfHealer.getBackoff(workflowId);
      workflow.retryCount++;

      // Context-aware retry: pick a different agent
      const intent = workflow.parsed?.intent || 'general';
      const newAgent = selfHealer.getRetryAgent(workflowId, intent);
      workflow._retryAgent = newAgent;

      log(`[SCORE] Retrying workflow ${workflowId} with ${newAgent} in ${backoff}ms (attempt ${workflow.retryCount})`);
      setTimeout(() => executeWorkflow(workflowId, workflowInput), backoff);
      return;
    }
  }

  const duration = Date.now() - startTime;

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
      workflow.result = await executeGeneralTask(parsed.target);
      workflow.status = 'completed';
      break;

    default:
      if (parsed.useTeam && parsed.target) {
        const teamResult = await spawnTeam(parsed.intent, parsed.target);
        workflow.teamId = teamResult.teamId;
        workflow.result = teamResult.response;
      } else if (parsed.target) {
        const agentResult = await spawnAgent(parsed.intent, parsed.target, workflow);
        workflow.agentId = agentResult.agentId;
        workflow.result = agentResult.response;
      } else {
        throw new Error('Could not parse command');
      }
  }
}

async function completeWorkflow(workflowId, duration) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  workflow.status = 'completed';
  workflow.endTime = new Date().toISOString();
  workflow.duration = duration;

  SWARM_MEMORY.session.completedTasks++;

  await publishEvent('orchestrator.workflow.completed', {
    workflowId,
    status: 'completed',
    result: workflow.result,
    duration
  });

  log(`Workflow ${workflowId} completed in ${duration}ms: ${workflow.result?.substring?.(0, 80) || workflow.result}`);

  // Stream result if needed
  if (workflow.streamId && activeStreams.has(workflow.streamId)) {
    streamResult(workflow.streamId, { type: 'completed', workflow });
  }

  // Move to completed (keep for 5 min for debugging)
  activeWorkflows.delete(workflowId);
  completedWorkflows.set(workflowId, workflow);
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
}

async function failWorkflow(workflowId, duration) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  workflow.status = 'failed';
  workflow.endTime = new Date().toISOString();
  workflow.duration = duration;

  SWARM_MEMORY.session.failedTasks++;

  await publishEvent('orchestrator.workflow.failed', {
    workflowId,
    error: workflow.error,
    duration
  });

  log(`Workflow ${workflowId} FAILED after ${duration}ms: ${workflow.error}`);

  if (workflow.streamId && activeStreams.has(workflow.streamId)) {
    streamResult(workflow.streamId, { type: 'failed', error: workflow.error });
  }

  activeWorkflows.delete(workflowId);
  completedWorkflows.set(workflowId, workflow);
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

async function spawnAgent(intent, target, workflow = null) {
  const agents = AGENT_BY_INTENT[intent] || [intent];

  // Context-aware retry: use the agent suggested by selfHealer.getRetryAgent()
  let agentName;
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

  try {
    const result = await towerRequest('POST', '/api/spawn', {
      agentName,
      task: taskDesc
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

async function getSwarmStatus() {
  try {
    const status = await towerRequest('GET', '/api/status');
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
    const status = await towerRequest('GET', '/api/status');
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
      client.write(payload);
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
    uptime: process.uptime()
  };
}

// ========== SSE BROADCAST ==========

function broadcastToClients(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      sseClients.add(res);
      res.write('data: {"type":"connected","service":"orchestrator"}\n\n');

      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Orchestrate command
    if (url.pathname === '/api/orchestrate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { command, urgent, stream } = JSON.parse(body);
          const streamId = stream ? createStream(workflowIdCounter.toString()) : null;

          const workflowId = `wf-${Date.now()}-${workflowIdCounter++}`;
          const result = await executeWorkflow(workflowId, { command, urgent, streamId });

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ workflowId, status: result.status, streamId }));
        } catch (e) {
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
    if (url.pathname === '/api/memory' && req.method === 'GET') {
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