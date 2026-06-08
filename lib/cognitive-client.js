'use strict';

/**
 * PURPCLAW Cognitive Services Client
 * ====================================
 * Soft-wrapper for the three Python cognitive services.
 * All calls are optional — they degrade gracefully when offline.
 *
 *   Modal Logic Engine      → http://localhost:7785   (Kripke epistemic/temporal/deontic)
 *   Autonomous Diagnostics  → http://localhost:7786   (causal fault analysis)
 *   Symbolic Rules Engine   → http://localhost:7787   (Datalog forward-chaining)
 *
 * Usage:
 *   const cog = require('./lib/cognitive-client');
 *
 *   // Diagnostics — call after a workflow fails
 *   const findings = await cog.diagnose({ source: 'orchestrator', event: 'workflow_failed', data });
 *
 *   // Rules — assert / check constraints
 *   await cog.assertFact('has_capability', ['wolf', 'architecture']);
 *   const ok = await cog.checkConstraint('assigned_to', ['wolf', 'task_123']);
 *
 *   // Modal — update & query agent belief state
 *   await cog.updateModalState('dragon', { prop: 'task_complete', value: true });
 *   const knows = await cog.evaluateModal('dragon', { op: 'KNOW', prop: 'task_complete' });
 */

const http = require('http');

const PORTS = {
  spine : 7880,  // Cognitive Spine — all 6 services unified
  modal : 7880,
  diagnostics : 7880,
  rules : 7880,
  neuro : 7880,
};

const TIMEOUT_MS = 5000;

// ── Health cache (30s) ─────────────────────────────────────────────────────────

const healthCache = {};
async function isOnline(service) {
  const now = Date.now();
  if (healthCache[service] && now - healthCache[service].ts < 30000) {
    return healthCache[service].ok;
  }
  const ok = await httpGet(PORTS[service], '/health').then(() => true).catch(() => false);
  healthCache[service] = { ok, ts: now };
  return ok;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function httpGet(port, path_) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: path_, method: 'GET', timeout: TIMEOUT_MS },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpPost(port, path_, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname : '127.0.0.1',
        port,
        path     : path_,
        method   : 'POST',
        timeout  : TIMEOUT_MS,
        headers  : {
          'Content-Type'   : 'application/json',
          'Content-Length' : Buffer.byteLength(payload),
        },
      },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── DIAGNOSTICS (port 7786) ────────────────────────────────────────────────────

/**
 * Report a system event to the diagnostics engine.
 * Non-blocking — fire and forget is fine.
 *
 * @param {{ source, event, severity?, data? }} evt
 */
async function reportEvent(evt) {
  try {
    return await httpPost(PORTS.diagnostics, '/diagnostics/event', {
      source   : evt.source || 'orchestrator',
      event    : evt.event  || 'unknown',
      severity : evt.severity || 'info',
      data     : evt.data || {},
      ts       : new Date().toISOString(),
    });
  } catch { return null; }
}

/**
 * Run the full multi-agent diagnosis and return findings.
 * Returns null if service offline.
 *
 * @param {{ source?, event?, data? }} context
 * @returns {{ findings, causalGraph, vote } | null}
 */
async function diagnose(context = {}) {
  if (!(await isOnline('diagnostics'))) return null;
  try {
    await reportEvent({ ...context, severity: 'error' });
    const [findings, vote] = await Promise.all([
      httpGet(PORTS.diagnostics, '/diagnostics/findings').catch(() => null),
      httpGet(PORTS.diagnostics, '/diagnostics/vote').catch(() => null),
    ]);
    return { findings, vote };
  } catch { return null; }
}

/**
 * Run diagnostics on a specific subsystem agent.
 * Returns raw findings or null.
 */
async function diagnoseAgent(agentName) {
  if (!(await isOnline('diagnostics'))) return null;
  try {
    return await httpPost(PORTS.diagnostics, '/diagnostics/diagnose', { agent: agentName });
  } catch { return null; }
}

/**
 * Format diagnostics findings as a readable string for logs.
 */
function formatFindings(result) {
  if (!result || !result.findings) return '';
  const f = result.findings;
  if (!Array.isArray(f) || f.length === 0) return '';
  const lines = f.slice(0, 5).map(x =>
    `  [${(x.severity || 'info').toUpperCase()}] ${x.subsystem || '?'}: ${x.description || JSON.stringify(x)}`
  );
  return `Diagnostics:\n${lines.join('\n')}`;
}

// ── SYMBOLIC RULES ENGINE (port 7787) ─────────────────────────────────────────

/**
 * Assert a fact into the rules engine.
 *
 * @param {string} predicate  — e.g. 'has_capability'
 * @param {string[]} terms    — e.g. ['wolf', 'architecture']
 * @param {string} [prov]     — provenance label
 */
async function assertFact(predicate, terms, prov = 'orchestrator') {
  try {
    return await httpPost(PORTS.rules, '/rules/assert', {
      fact: `${predicate}(${terms.map(t => String(t)).join(',')})`,
      provenance: prov,
    });
  } catch { return null; }
}

/**
 * Retract a fact from the rules engine.
 */
async function retractFact(predicate, terms) {
  try {
    return await httpPost(PORTS.rules, '/rules/retract', { predicate, terms });
  } catch { return null; }
}

/**
 * Run a Datalog-style query.
 * Returns matching fact tuples or empty array.
 *
 * @param {string} predicate
 * @param {Array} terms — use null as wildcard
 */
async function queryFacts(predicate, terms = []) {
  try {
    const result = await httpPost(PORTS.rules, '/rules/query', {
      query: `${predicate}(${terms.map(t => t === null ? 'X' : String(t)).join(',')})`,
    });
    return result?.results || result || [];
  } catch { return []; }
}

/**
 * Check a constraint — returns { satisfied: bool, explanation } or null.
 */
async function checkConstraint(predicate, terms) {
  try {
    return await httpPost(PORTS.rules, '/rules/check', { predicate, terms });
  } catch { return null; }
}

/**
 * Add an inference rule.
 *
 * @param {string} head   — e.g. 'can_handle(X, Y)'
 * @param {string[]} body — e.g. ['has_capability(X, Y)', 'is_available(X)']
 */
async function addRule(head, body) {
  try {
    const ruleStr = Array.isArray(body) ? `${head} :- ${body.join(', ')}` : `${head} :- ${body}`;
    return await httpPost(PORTS.rules, '/rules/rule', { rule: ruleStr });
  } catch { return null; }
}

// ── MODAL LOGIC ENGINE (port 7785) ────────────────────────────────────────────

/**
 * Update an agent's world state (propositions it knows about).
 *
 * @param {string} agentName
 * @param {{ prop: string, value: boolean, world?: string }} update
 */
async function updateModalState(agentName, update) {
  try {
    // Map to spine: /modal/agent/epistemic/know (or /doxastic/belief, /deontic/permit)
    const endpoint = update.mode === 'belief' ? '/modal/agent/doxastic/belief'
                  : update.mode === 'permit' ? '/modal/agent/deontic/permit'
                  : '/modal/agent/epistemic/know';
    return await httpPost(PORTS.modal, endpoint, {
      agent_id : agentName || 'PURPCLAW_CORE',
      prop     : update.prop,
      value    : update.value ?? true,
    });
  } catch { return null; }
}

/**
 * Evaluate a modal formula for an agent.
 *
 * @param {string} agentName
 * @param {{ op: string, prop: string, world?: string }} formula
 *        op ∈ { KNOW, KNOW_NOT, BELIEVES, MUST, MAY, EVENTUALLY, ... }
 * @returns {{ result: boolean, explanation: string } | null}
 */
async function evaluateModal(agentName, formula) {
  try {
    // Map to spine: GET /modal/agent/:agentName for current state,
    // then the caller can evaluate the returned state
    return await httpGet(PORTS.modal, `/modal/agent/${encodeURIComponent(agentName || 'PURPCLAW_CORE')}`);
  } catch { return null; }
}

/**
 * Get the full Kripke model state for an agent.
 */
async function getAgentModalState(agentName) {
  try {
    return await httpGet(PORTS.modal, `/modal/agent/${encodeURIComponent(agentName)}`);
  } catch { return null; }
}

// ── NEURO-SYMBOLIC BRIDGE (port 7884) ─────────────────────────

async function getNeuroStats() {
  try {
    return await httpGet(PORTS.neuro, '/neuro-symbolic/stats');
  } catch { return null; }
}

async function liftPattern(pattern, source = 'purpclaw', confidence = 0.9, metadata = {}) {
  const payload = {
    pattern_type: pattern,
    source,
    confidence,
    metadata,
  };
  try {
    return await httpPost(PORTS.neuro, '/neuro-symbolic/lift/anomaly', payload);
  } catch (firstError) {
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      return await httpPost(PORTS.neuro, '/neuro-symbolic/lift/anomaly', payload);
    } catch (secondError) {
      return { success: false, error: secondError.message || firstError.message || 'liftPattern failed' };
    }
  }
}

async function queryNeuro(factType = 'pattern_detected', limit = 10) {
  const q = `/neuro-symbolic/query?fact_type=${encodeURIComponent(factType)}&limit=${encodeURIComponent(limit)}`;
  try {
    return await httpGet(PORTS.neuro, q);
  } catch (firstError) {
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      return await httpGet(PORTS.neuro, q);
    } catch (secondError) {
      return { success: false, error: secondError.message || firstError.message || 'queryNeuro failed' };
    }
  }
}

// ── Combined service health check ─────────────────────────────────────────────

async function getServiceStatus() {
  const [modal, diagnostics, rules, neuro] = await Promise.all([
    isOnline('modal'),
    isOnline('diagnostics'),
    isOnline('rules'),
    isOnline('neuro'),
  ]);
  return { modal, diagnostics, rules, neuro };
}

// ── Module exports ─────────────────────────────────────────────────────────────

module.exports = {
  // Diagnostics
  diagnose,
  diagnoseAgent,
  reportEvent,
  formatFindings,

  // Rules engine
  assertFact,
  retractFact,
  queryFacts,
  checkConstraint,
  addRule,

  // Modal logic
  updateModalState,
  evaluateModal,
  getAgentModalState,
  getNeuroStats,
  liftPattern,
  queryNeuro,

  // Meta
  isOnline,
  getServiceStatus,
  PORTS,
};
