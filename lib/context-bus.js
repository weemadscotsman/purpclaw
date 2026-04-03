/**
 * Cross-Agent Context Bus — shared.json
 * 
 * Persistent cross-agent state store. Reads EventBus messages to keep
 * shared.json updated. Agents query it to know what other agents are doing
 * without needing to be directly connected.
 * 
 * Wired into orchestrator on init. Hermes talks to it via:
 *   GET /context/agent/<name>    — agent's current state
 *   GET /context/team/<intent>  — active team for an intent
 *   POST /context/lock          — acquire resource lock
 *   DELETE /context/lock/<id>   — release lock
 *   GET /context/stats          — all active agents + locks
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// ─── File lock (cross-process safety) ───────────────────────────────────────
const LOCK_FILE = path.join(__dirname, '..', 'agent_work', '.context.lock');

function acquireLock(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      fs.rmSync(LOCK_FILE); // stale lock — delete and retry
    }
  }
  return false;
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

// ─── Shared context file ────────────────────────────────────────────────────
const CONTEXT_FILE = path.join(__dirname, '..', 'agent_work', 'shared.json');

function readContext() {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
    }
  } catch {}
  return defaultContext();
}

function writeContext(ctx) {
  ctx._updatedAt = new Date().toISOString();
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(ctx, null, 2));
}

function defaultContext() {
  return {
    version: 1,
    timestamp: Date.now(),
    _updatedAt: new Date().toISOString(),
    agents: {},
    workflows: {},
    locks: {},
    stats: { totalAgentsSpawned: 0, totalWorkflowsCompleted: 0, totalFailures: 0 }
  };
}

// ─── Context Bus class ──────────────────────────────────────────────────────
class ContextBus {
  constructor() {
    this.context = readContext();
    this.httpServer = null;
    this.eventBusPort = 7782;
    this.eventBusHost = '127.0.0.1';
  }

  // ── Agent state ──────────────────────────────────────────────────────────

  setAgentState(agentId, state) {
    const ctx = readContext();
    ctx.agents[agentId] = {
      ...(ctx.agents[agentId] || {}),
      ...state,
      _lastSeen: Date.now()
    };
    writeContext(ctx);
    this.context = ctx;
    return ctx.agents[agentId];
  }

  getAgentState(agentId) {
    const ctx = readContext();
    return ctx.agents[agentId] || null;
  }

  removeAgent(agentId) {
    const ctx = readContext();
    // Move to history
    if (ctx.agents[agentId]) {
      ctx._history = ctx._history || [];
      ctx._history.push({ ...ctx.agents[agentId], _removedAt: Date.now(), _agentId: agentId });
      if (ctx._history.length > 100) ctx._history = ctx._history.slice(-100);
    }
    delete ctx.agents[agentId];
    writeContext(ctx);
    this.context = ctx;
  }

  // ── Workflow state ───────────────────────────────────────────────────────

  setWorkflowState(workflowId, state) {
    const ctx = readContext();
    ctx.workflows[workflowId] = { ...(ctx.workflows[workflowId] || {}), ...state, _lastSeen: Date.now() };
    writeContext(ctx);
    this.context = ctx;
    return ctx.workflows[workflowId];
  }

  getWorkflowState(workflowId) {
    const ctx = readContext();
    return ctx.workflows[workflowId] || null;
  }

  // ── Resource locks ───────────────────────────────────────────────────────

  acquireLock(resourceId, agentId, ttlMs = 30000) {
    const ctx = readContext();
    const existing = ctx.locks[resourceId];
    if (existing) {
      // Check if expired
      if (Date.now() - existing._acquiredAt < existing.ttlMs) {
        if (existing.agentId !== agentId) {
          return { success: false, lockedBy: existing.agentId, ttlMs: existing.ttlMs - (Date.now() - existing._acquiredAt) };
        }
        // Same agent — refresh
      }
    }
    ctx.locks[resourceId] = { agentId, _acquiredAt: Date.now(), ttlMs };
    writeContext(ctx);
    this.context = ctx;
    return { success: true, lockId: resourceId };
  }

  releaseLock(resourceId, agentId) {
    const ctx = readContext();
    const lock = ctx.locks[resourceId];
    if (!lock) return { success: true, reason: 'not locked' };
    if (lock.agentId !== agentId) return { success: false, reason: 'not your lock', lockedBy: lock.agentId };
    delete ctx.locks[resourceId];
    writeContext(ctx);
    this.context = ctx;
    return { success: true };
  }

  // ── Active team lookup ───────────────────────────────────────────────────

  getActiveTeam(intent) {
    const ctx = readContext();
    const active = [];
    for (const [agentId, state] of Object.entries(ctx.agents)) {
      if (state.intent === intent && state.status === 'active') {
        active.push({ agentId, ...state });
      }
    }
    return active;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    const ctx = readContext();
    const now = Date.now();
    const staleThreshold = 60000; // 60s
    const activeAgents = Object.entries(ctx.agents).filter(([, a]) => now - (a._lastSeen || 0) < staleThreshold);
    return {
      activeAgents: activeAgents.length,
      totalAgents: Object.keys(ctx.agents).length,
      totalWorkflows: Object.keys(ctx.workflows).length,
      activeLocks: Object.keys(ctx.locks).length,
      stats: ctx.stats,
      staleThreshold
    };
  }

  // ── EventBus integration ─────────────────────────────────────────────────

  listenToEventBus() {
    // Poll EventBus via HTTP SSE or HTTP poll every 2s
    this._eventPollInterval = setInterval(() => this.pollEventBus(), 2000);
  }

  pollEventBus() {
    return new Promise((resolve) => {
      try {
        const req = http.request({
          hostname: this.eventBusHost,
          port: this.eventBusPort,
          path: '/events',
          method: 'GET',
          timeout: 3000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { this.handleEventBusMessages(JSON.parse(data)); } catch {}
            resolve();
          });
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.end();
      } catch {
        resolve();
      }
    });
  }

  handleEventBusMessages(events) {
    if (!Array.isArray(events)) return;
    for (const event of events) {
      const { type, data } = event;
      switch (type) {
        case 'agent.spawned':
          this.setAgentState(data.agentId, {
            status: 'active',
            intent: data.intent,
            workflowId: data.workflowId,
            spawnedAt: Date.now(),
            pid: data.pid
          });
          this.incrementStat('totalAgentsSpawned');
          break;

        case 'agent.completed':
          this.removeAgent(data.agentId);
          break;

        case 'agent.failed':
          this.setAgentState(data.agentId, { status: 'failed', failedAt: Date.now(), error: data.error });
          break;

        case 'orchestrator.workflow.started':
          this.setWorkflowState(data.workflowId, {
            status: 'active',
            command: data.command,
            intent: data.intent,
            startedAt: Date.now()
          });
          break;

        case 'orchestrator.workflow.completed':
          this.setWorkflowState(data.workflowId, { status: 'completed', completedAt: Date.now() });
          this.incrementStat('totalWorkflowsCompleted');
          break;

        case 'orchestrator.workflow.failed':
          this.setWorkflowState(data.workflowId, { status: 'failed', failedAt: Date.now() });
          this.incrementStat('totalFailures');
          break;
      }
    }
  }

  incrementStat(key) {
    const ctx = readContext();
    ctx.stats[key] = (ctx.stats[key] || 0) + 1;
    writeContext(ctx);
  }

  // ── HTTP API (for agents to query) ──────────────────────────────────────

  startHttpServer(port = 7881) {
    this.httpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      const url = req.url.split('?')[0];

      // GET /context/stats
      if (req.method === 'GET' && url === '/context/stats') {
        res.end(JSON.stringify(this.getStats()));
        return;
      }

      // GET /context/agent/:name
      const agentMatch = url.match(/^\/context\/agent\/(.+)$/);
      if (req.method === 'GET' && agentMatch) {
        const state = this.getAgentState(agentMatch[1]);
        res.end(JSON.stringify(state || { not_found: true }));
        return;
      }

      // GET /context/team/:intent
      const teamMatch = url.match(/^\/context\/team\/(.+)$/);
      if (req.method === 'GET' && teamMatch) {
        res.end(JSON.stringify(this.getActiveTeam(teamMatch[1])));
        return;
      }

      // GET /context/workflows
      if (req.method === 'GET' && url === '/context/workflows') {
        const ctx = readContext();
        res.end(JSON.stringify(ctx.workflows));
        return;
      }

      // POST /context/lock {resourceId, agentId, ttlMs?}
      if (req.method === 'POST' && url === '/context/lock') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          const { resourceId, agentId, ttlMs } = JSON.parse(body);
          const result = this.acquireLock(resourceId, agentId, ttlMs);
          res.end(JSON.stringify(result));
        });
        return;
      }

      // DELETE /context/lock/:resourceId?agentId=
      const unlockMatch = url.match(/^\/context\/lock\/(.+)$/);
      if (req.method === 'DELETE' && unlockMatch) {
        const params = new URL(`http://localhost${req.url}`, 'http://localhost').searchParams;
        const agentId = params.get('agentId') || '';
        const result = this.releaseLock(unlockMatch[1], agentId);
        res.end(JSON.stringify(result));
        return;
      }

      // GET /health
      if (req.method === 'GET' && url === '/health') {
        res.end(JSON.stringify({ status: 'healthy', service: 'context-bus', port }));
        return;
      }

      res.end(JSON.stringify({ error: 'not found', path: url }));
    });

    this.httpServer.listen(port, '127.0.0.1', () => {
      console.log(`[CONTEXT-BUS] listening on :${port}`);
    });
  }

  // ── Orchestrator hooks (inline, no external deps) ──────────────────────

  hookIntoOrchestrator(orchestratorPath) {
    // Read orchestrator.js and inject ContextBus event publishing
    try {
      const content = fs.readFileSync(orchestratorPath, 'utf8');
      // Check if already hooked
      if (content.includes('ContextBus')) return { already_hooked: true };
      // Prepend require + instantiate at top of orchestrator
      const inject = `
const ContextBus = require('./lib/context-bus.js');
const contextBus = new ContextBus();
contextBus.listenToEventBus();
contextBus.startHttpServer(7881);

// Patch publishEvent to also update context bus
const _origPublishEvent = publishEvent;
publishEvent = async function(topic, data) {
  const result = await _origPublishEvent(topic, data);
  // Mirror key events to context bus
  if (topic.startsWith('agent.')) contextBus.pollEventBus();
  if (topic.startsWith('orchestrator.workflow.')) contextBus.pollEventBus();
  return result;
};
`;
      // Inject after the publishEvent function definition
      const injectIdx = content.indexOf('function publishEvent(topic, data)');
      if (injectIdx >= 0) {
        const afterFunc = content.indexOf('\n}', injectIdx);
        const newContent = content.slice(0, afterFunc + 2) + inject + content.slice(afterFunc + 2);
        fs.writeFileSync(orchestratorPath, newContent);
        return { hooked: true };
      }
      return { hooked: false, reason: 'publishEvent not found' };
    } catch (e) {
      return { error: e.message };
    }
  }

  stop() {
    if (this._eventPollInterval) clearInterval(this._eventPollInterval);
    if (this.httpServer) this.httpServer.close();
  }
}

module.exports = ContextBus;

// ─── CLI entry ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const bus = new ContextBus();
  bus.listenToEventBus();
  bus.startHttpServer(parseInt(process.env.CONTEXT_PORT || '7881', 10));
  console.log('[CONTEXT-BUS] cross-agent state bus started');
}