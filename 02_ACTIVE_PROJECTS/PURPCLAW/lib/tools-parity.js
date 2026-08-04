'use strict';

/**
 * tools-parity — real native tools that expose the PURPCLAW spine to any agent
 * calling the shared tool registry. Every tool below is a thin wrapper over a
 * real backend module (steering-router / stack-truth / job-chain / proof-ledger
 * / insight / purpflow / agent-health / agent-registry / memory-client). No
 * stubs, no sim; if a service is down, the tool reports it honestly.
 *
 * Wired into lib/tools/index.js so the tool registry surfaces these to agents.
 */

function registerParityTools(registry) {
  const safe = (fn) => async (args = {}) => {
    try { const r = await fn(args); return r == null ? { ok: true } : r; }
    catch (e) { return { ok: false, error: e && e.message || String(e) }; }
  };

  // ── steering / routing ─────────────────────────────────────────────────────
  registry.register({
    name: 'steer_classify',
    description: 'Classify a chat/request into an execution route (chat/agent/skill/swarm/research/job) without opening a job. Pure, no side effects.',
    inputSchema: { type: 'object', properties: { message: { type: 'string' }, mode: { type: 'string' } }, required: ['message'] },
    execute: safe(async ({ message, mode }) => require('./steering-router').classify(message, { mode })),
  });
  registry.register({
    name: 'steer_open_job',
    description: 'Steer a request AND open a real kernel job for it (delegated). Returns the job id + chain-ready decision.',
    inputSchema: { type: 'object', properties: { message: { type: 'string' }, sessionId: { type: 'string' } }, required: ['message'] },
    execute: safe(async ({ message, sessionId }) => require('./steering-router').steer(message, { execute: true, sessionId, source: 'tool' })),
  });

  // ── stack sources of truth ─────────────────────────────────────────────────
  registry.register({
    name: 'stack_audit',
    description: 'Audit every canonical source-of-truth module (12 concerns): does each one load, and are any owners in conflict?',
    inputSchema: { type: 'object', properties: {} },
    execute: safe(async () => require('./stack-truth').audit()),
  });
  registry.register({
    name: 'stack_decide',
    description: 'Ask the backend to decide the best course of action for a concern (steering|agent|model|skill), from real live state.',
    inputSchema: { type: 'object', properties: { concern: { type: 'string' }, task: { type: 'string' }, message: { type: 'string' } }, required: ['concern'] },
    execute: safe(async (args) => require('./stack-truth').decide(args.concern, args)),
  });

  // ── job-chain ──────────────────────────────────────────────────────────────
  registry.register({
    name: 'chain_read',
    description: 'Read a job\'s full start→finish chain, with the exact hop that broke if it failed.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
    execute: safe(async ({ jobId }) => require('./job-chain').get(jobId)),
  });
  registry.register({
    name: 'chain_step',
    description: 'Append a manual chain step to a job (for tool/skill/agent hops not automatically captured).',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' }, stage: { type: 'string' }, area: { type: 'string' }, to: { type: 'string' }, detail: { type: 'string' }, status: { type: 'string' } }, required: ['jobId'] },
    execute: safe(async (args) => require('./job-chain').step(args.jobId, args)),
  });

  // ── proof-ledger ───────────────────────────────────────────────────────────
  registry.register({
    name: 'receipts_stats',
    description: 'Read proof-ledger stats: totals, verified/failed, fake-greens (receipts claiming pass without proof).',
    inputSchema: { type: 'object', properties: {} },
    execute: safe(async () => require('./proof-ledger').stats()),
  });
  registry.register({
    name: 'receipts_recent',
    description: 'Read recent proof-ledger receipts, optionally filtered by agent/project/status.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer' }, agent: { type: 'string' }, project: { type: 'string' }, status: { type: 'string' } } },
    execute: safe(async (args) => require('./proof-ledger').recent(args.limit || 50, args)),
  });
  registry.register({
    name: 'receipts_for_job',
    description: 'Read all proof-ledger receipts for one jobId (task chain history).',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
    execute: safe(async ({ jobId }) => require('./proof-ledger').byTask(jobId)),
  });
  registry.register({
    name: 'receipt_record',
    description: 'Write a proof-ledger receipt for a state-changing action. Include claim, evidence[], verification.',
    inputSchema: { type: 'object', properties: { agent: { type: 'string' }, tool: { type: 'string' }, claim: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } }, status: { type: 'string' } }, required: ['claim'] },
    execute: safe(async (args) => require('./proof-ledger').record(args)),
  });

  // ── insight (mid-job learning) ─────────────────────────────────────────────
  registry.register({
    name: 'insight_capture',
    description: 'Capture a mid-job better-way (instant recall, permanent, cache-cleared). Use when you discover a superior tool/technique during work.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, jobId: { type: 'string' }, kind: { type: 'string' } }, required: ['text'] },
    execute: safe(async (args) => ({ ok: true, id: await require('./insight').capture(args.text, args) })),
  });
  registry.register({
    name: 'insight_recall',
    description: 'Recall learned better-ways for a query (always fresh — bypasses recall cache).',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    execute: safe(async ({ query, limit }) => require('./insight').recall(query, { limit: limit || 6 })),
  });

  // ── purpflow (controlled recursion) ────────────────────────────────────────
  registry.register({
    name: 'purpflow_run',
    description: 'Run a controlled recursion loop with receipts (goal|plan|validate|execute|review|repair|prove). Never open-ended.',
    inputSchema: { type: 'object', properties: { mode: { type: 'string' }, objective: { type: 'string' }, execute: { type: 'boolean' }, checks: { type: 'array', items: { type: 'string' } } }, required: ['mode', 'objective'] },
    execute: safe(async (args) => require('./purpflow').run(args.mode, args.objective, args)),
  });
  registry.register({
    name: 'purpflow_load',
    description: 'Load a prior purpflow loop by id (see receipts + stop reason + steps).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: safe(async ({ id }) => require('./purpflow').load(id)),
  });

  // ── agent registry + health ────────────────────────────────────────────────
  registry.register({
    name: 'agent_health',
    description: 'Health-check the whole agent roster (registered/executor/model resolves/division/role) or one agent by key.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
    execute: safe(async ({ key }) => {
      const h = require('./agent-health');
      return key ? h.checkAgent(key) : h.checkAll();
    }),
  });
  registry.register({
    name: 'agent_list',
    description: 'List every registered agent (deduped), with division/role/model/type.',
    inputSchema: { type: 'object', properties: { division: { type: 'string' }, type: { type: 'string' } } },
    execute: safe(async (args) => {
      let list = require('./agent-registry').listAgents();
      if (args.division) list = list.filter(a => (a.division || '').toUpperCase() === args.division.toUpperCase());
      if (args.type) list = list.filter(a => a.type === args.type);
      return { count: list.length, agents: list };
    }),
  });
  registry.register({
    name: 'agent_get',
    description: 'Get one agent\'s full record by key or name.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    execute: safe(async ({ key }) => require('./agent-registry').getAgent(key)),
  });

  // ── memory (all-layers, permanent, instant) ────────────────────────────────
  registry.register({
    name: 'memory_recall',
    description: 'Recall memory across all layers (episodic, semantic, scratch, temporal, vector). Instant — no 30s cache lag.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    execute: safe(async ({ query, limit }) => require('./memory-client').recall(query, { limit: limit || 6, useCache: false })),
  });
  registry.register({
    name: 'memory_ingest',
    description: 'Ingest a memory (permanent, durable-queued, importance-weighted, self-improving on recall).',
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, source: { type: 'string' }, importance: { type: 'number' } }, required: ['content'] },
    execute: safe(async (args) => ({ id: await require('./memory-client').ingest(args.content, args) })),
  });
  registry.register({
    name: 'memory_online',
    description: 'Is the memory spine (:7880) reachable? Boolean + latency.',
    inputSchema: { type: 'object', properties: {} },
    execute: safe(async () => ({ online: await require('./memory-client').isOnline() })),
  });

  // ── truth manifest + parity ────────────────────────────────────────────────
  registry.register({
    name: 'truth_manifest',
    description: 'Read the live truth manifest — every honest number from the auditor (agents, tools, memory, providers, systems, parity, etc.).',
    inputSchema: { type: 'object', properties: {} },
    execute: safe(async () => {
      const fs = require('fs'); const path = require('path');
      const p = path.join(process.cwd(), 'public', 'showcase', 'truth-manifest.json');
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }),
  });
  registry.register({
    name: 'parity_report',
    description: 'Read the CLI↔API parity report: 178 CLI cases vs 78 API routes, matches, gaps, bridges.',
    inputSchema: { type: 'object', properties: {} },
    execute: safe(async () => {
      const fs = require('fs'); const path = require('path');
      const p = path.join(process.cwd(), 'public', 'showcase', 'parity-report.json');
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }),
  });
}

module.exports = { registerParityTools };
