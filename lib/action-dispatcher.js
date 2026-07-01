'use strict';

const http = require('http');
const { findCapability } = require('./surface-capabilities');
const hivemind = require('./hivemind');

const PORTS = {
  api: Number(process.env.API_PORT || 7780),
  orchestrator: Number(process.env.ORCHESTRATOR_PORT || 7784),
  tower: Number(process.env.TOWER_PORT || 7790),
  memory: Number(process.env.MEMORY_PORT || 7880),
  pool: Number(process.env.POOL_PORT || 7885),
};

function postJson(port, path, body, timeoutMs = 300000) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.on('error', error => resolve({ ok: false, status: 0, error: error.message }));
    req.write(payload);
    req.end();
  });
}

function getJson(port, path, timeoutMs = 30000) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      timeout: timeoutMs,
      headers: { accept: 'application/json' },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.on('error', error => resolve({ ok: false, status: 0, error: error.message }));
    req.end();
  });
}

function requireTask(id, task) {
  if (!String(task || '').trim()) {
    throw new Error(`action ${id} requires a task/query string`);
  }
}

function buildActionPlan(id, task = '', options = {}) {
  const capability = findCapability(id);
  if (!capability) throw new Error(`unknown capability: ${id}`);
  const text = String(task || '').trim();
  const source = options.source || 'surface-action';

  const base = {
    ok: true,
    capability,
    task: text,
    source,
    dispatchable: true,
    method: 'POST',
    port: PORTS.api,
    path: '/',
    body: {},
    cli: capability.cli,
    web: capability.web,
    setup: capability.setup,
  };

  if (id === 'chat') {
    requireTask(id, text);
    return { ...base, port: PORTS.api, path: '/api/chat', body: { message: text, spawnAgents: options.delegate !== false, source } };
  }
  if (id === 'mission') {
    requireTask(id, text);
    return { ...base, port: PORTS.orchestrator, path: '/api/orchestrate', body: { command: text, text, source } };
  }
  if (id === 'swarm') {
    requireTask(id, text);
    return { ...base, port: PORTS.api, path: '/api/kernel/jobs', body: { goal: text, route: 'swarm-coordinator', source } };
  }
  if (id === 'agent') {
    requireTask(id, text);
    return { ...base, port: PORTS.tower, path: '/api/spawn', body: { agentName: options.agent || 'robot', task: text, options: { source } } };
  }
  if (id === 'research') {
    requireTask(id, text);
    return { ...base, port: PORTS.api, path: '/api/research/group', body: { query: text, kernelJob: true, depth: Number(options.depth || 2), model_count: Number(options.modelCount || 24), source } };
  }
  if (id === 'memory') {
    requireTask(id, text);
    return { ...base, port: PORTS.memory, path: '/memory/recall', body: { query: text, limit: Number(options.limit || 8), source } };
  }
  if (id === 'knowledge-pool') {
    requireTask(id, text);
    return { ...base, method: 'GET', port: PORTS.pool, path: `/pool/skills/search?q=${encodeURIComponent(text)}&limit=${Number(options.limit || 10)}`, body: null };
  }
  if (id === 'hivemind') {
    const mode = (options.mode || text || 'spring').toLowerCase();
    if (mode.startsWith('validate')) {
      const raw = text.replace(/^validate\s*/i, '').trim();
      let body = { outcome: 'success', tests_passed: true, evidence: ['surface_action'], source };
      if (raw) {
        try { body = { ...body, ...JSON.parse(raw) }; } catch { body = { ...body, content: raw }; }
      }
      return { ...base, port: PORTS.orchestrator, path: '/api/hivemind/validate', body };
    }
    if (mode.includes('doctrine')) return { ...base, method: 'GET', port: PORTS.orchestrator, path: '/api/hivemind/doctrine', body: null };
    if (mode.includes('principle')) return { ...base, method: 'GET', port: PORTS.orchestrator, path: '/api/hivemind/principles', body: null };
    if (mode.includes('status')) return { ...base, method: 'GET', port: PORTS.orchestrator, path: '/api/hivemind/status', body: null };
    return { ...base, method: 'GET', port: PORTS.orchestrator, path: '/api/hivemind/spring', body: null };
  }
  if (id === 'steering') {
    return { ...base, method: 'LOCAL', path: 'hivemind.steering.context', body: { query: text || 'general', source } };
  }
  if (id === 'stress') {
    return { ...base, method: 'LOCAL', path: 'hivemind.stress.evidence', body: { scenario: text || 'general stress scenario', source } };
  }
  if (id === 'task-registry') {
    return { ...base, method: 'LOCAL', path: 'hivemind.task_registry.plan', body: { task: text || 'discover tasks', source } };
  }
  if (id === 'podcast-studio') {
    return { ...base, method: 'LOCAL', path: 'hivemind.podcast_studio.plan', body: { topic: text || 'operator selected topic', source } };
  }
  if (id === 'imessage') {
    const mode = String(options.mode || text || 'status').toLowerCase();
    return {
      ...base,
      method: 'LOCAL',
      path: mode.includes('status') ? 'photon.imessage.status' : 'photon.imessage.send',
      body: {
        task: text,
        to: options.to || null,
        message: options.message || null,
        service: options.service || 'imessage',
        confirmSend: options.confirmSend === true,
        source,
        provider: 'photon',
        no_mac_relay: true,
      },
    };
  }
  if (id === 'raft-agent-network') {
    const mode = String(options.mode || text || 'status').toLowerCase();
    return {
      ...base,
      method: 'LOCAL',
      path: mode.includes('status') ? 'raft.agent_network.status' : 'raft.agent_network.dispatch',
      body: {
        task: text,
        peer: options.peer || null,
        channel: options.channel || 'imessage',
        thread: options.thread || null,
        targetCapability: options.targetCapability || null,
        confirmDispatch: options.confirmDispatch === true,
        source,
        provider: 'raft',
        gatewayChannel: true,
      },
    };
  }
  if (id === 'health') {
    return { ...base, method: 'GET', port: PORTS.api, path: '/api/pulse', body: null };
  }

  return {
    ...base,
    dispatchable: false,
    method: 'NAVIGATE',
    path: capability.web.route,
    body: null,
    note: `${capability.label} is a setup/tooling surface. Open ${capability.web.route} or run ${capability.cli[0]}.`,
  };
}

async function dispatchAction(id, task = '', options = {}) {
  const plan = buildActionPlan(id, task, options);
  if (options.dryRun || !plan.dispatchable) return { ok: true, dryRun: !!options.dryRun, plan };
  if (plan.method === 'LOCAL') return dispatchLocal(plan);
  const result = plan.method === 'GET'
    ? await getJson(plan.port, plan.path, options.timeoutMs)
    : await postJson(plan.port, plan.path, plan.body, options.timeoutMs);
  return { ok: result.ok, plan, result };
}

async function dispatchLocal(plan) {
  if (plan.path === 'photon.imessage.status' || plan.path === 'photon.imessage.send') {
    const photon = require('./photon-imessage');
    const result = plan.path === 'photon.imessage.status'
      ? await photon.status({ timeoutMs: plan.body?.timeoutMs })
      : await photon.send(plan.body?.task || '', plan.body || {});
    const trace = hivemind.startTrace({
      task: plan.task || plan.capability.label,
      source: plan.source || 'surface-action',
      agent: 'surface-dispatcher',
      intent: plan.capability.id,
      job_type: plan.capability.category,
      evidence: [`capability:${plan.capability.id}`, 'provider:photon', 'no_mac_relay:true'],
    });
    const finished = hivemind.finishTrace(trace.run_id, {
      outcome: result.ok ? 'success' : 'failed',
      tests_passed: null,
      evidence: [`local_plan:${plan.path}`, `configured:${Boolean(result.configured)}`, `provider:${result.provider}`],
      diff_summary: `${plan.capability.label}: ${JSON.stringify(result.summary || { mode: plan.path })}`,
    });
    return { ok: result.ok, plan, result: { ok: result.ok, status: result.status || (result.ok ? 200 : 400), body: { ...result, trace_id: finished.run_id, spring_rank: finished.spring_rank, trust_score: finished.trust_score } } };
  }

  if (plan.path === 'raft.agent_network.status' || plan.path === 'raft.agent_network.dispatch') {
    const raft = require('./raft-agent-network');
    const result = plan.path === 'raft.agent_network.status'
      ? await raft.status({ timeoutMs: plan.body?.timeoutMs })
      : await raft.dispatch(plan.body?.task || '', plan.body || {});
    const trace = hivemind.startTrace({
      task: plan.task || plan.capability.label,
      source: plan.source || 'surface-action',
      agent: 'surface-dispatcher',
      intent: plan.capability.id,
      job_type: plan.capability.category,
      evidence: [`capability:${plan.capability.id}`, 'provider:raft', 'gateway_channel:true', `channel:${plan.body?.channel || 'unknown'}`],
    });
    const finished = hivemind.finishTrace(trace.run_id, {
      outcome: result.ok ? 'success' : 'failed',
      tests_passed: null,
      evidence: [`local_plan:${plan.path}`, `configured:${Boolean(result.configured)}`, `provider:${result.provider}`],
      diff_summary: `${plan.capability.label}: ${JSON.stringify(result.summary || { mode: plan.path })}`,
    });
    return { ok: result.ok, plan, result: { ok: result.ok, status: result.status || (result.ok ? 200 : 400), body: { ...result, trace_id: finished.run_id, spring_rank: finished.spring_rank, trust_score: finished.trust_score } } };
  }

  const trace = hivemind.startTrace({
    task: plan.task || plan.capability.label,
    source: plan.source || 'surface-action',
    agent: 'surface-dispatcher',
    intent: plan.capability.id,
    job_type: plan.capability.category,
    evidence: [`capability:${plan.capability.id}`, `source:${plan.path}`],
  });
  const finished = hivemind.finishTrace(trace.run_id, {
    outcome: 'success',
    tests_passed: null,
    evidence: [`local_plan:${plan.path}`, `setup:${plan.setup.join('|')}`],
    diff_summary: `${plan.capability.label}: ${JSON.stringify(plan.body || {})}`,
  });
  return {
    ok: true,
    plan,
    result: {
      ok: true,
      status: 200,
      body: {
        ok: true,
        trace_id: finished.run_id,
        spring_rank: finished.spring_rank,
        trust_score: finished.trust_score,
        note: 'Recorded Hivemind wrapper trace; no side-folder code was executed.',
      },
    },
  };
}

module.exports = { buildActionPlan, dispatchAction, PORTS };
