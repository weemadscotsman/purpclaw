'use strict';

/**
 * PURPCLAW Context Packet
 * =======================
 * Workflow-scoped inter-agent output store.
 * Agents write their results here; downstream agents read prior outputs
 * so each one builds on what came before instead of starting cold.
 *
 *   agent_work/
 *     <workflowId>/
 *       dragon.out        ← architecture spec
 *       robot.out         ← implementation
 *       bee.out           ← integration wiring
 *       _manifest.json    ← ordered list + metadata
 *       _result.json      ← synthesised final output
 *
 * Usage:
 *   const cp = require('./lib/context-packet');
 *
 *   // Agent finishes → save its output
 *   cp.write(workflowId, 'dragon', output);
 *
 *   // Next agent spawns → inject all prior outputs
 *   const handoff = cp.readHandoff(workflowId, 'robot'); // excludes robot's own output
 *
 *   // Workflow completes → synthesise final result
 *   const result = cp.synthesize(workflowId);
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const AGENT_WORK_DIR = path.join(
  process.env.PURPCLAW_DIR || path.join(__dirname, '..'),
  'agent_work'
);

// ── Path helpers ──────────────────────────────────────────────────────────────

function workflowDir(workflowId) {
  return path.join(AGENT_WORK_DIR, sanitizeId(workflowId));
}

function outFile(workflowId, agentName) {
  return path.join(workflowDir(workflowId), `${sanitizeId(agentName)}.out`);
}

function manifestFile(workflowId) {
  return path.join(workflowDir(workflowId), '_manifest.json');
}

function resultFile(workflowId) {
  return path.join(workflowDir(workflowId), '_result.json');
}

function sanitizeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 64);
}

function ensureDir(workflowId) {
  const dir = workflowDir(workflowId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Core read/write ───────────────────────────────────────────────────────────

/**
 * Save an agent's output for this workflow.
 *
 * @param {string} workflowId
 * @param {string} agentName
 * @param {string|object} output   - Raw string or parsed object
 * @param {object} meta            - Optional metadata (intent, duration, success)
 */
function write(workflowId, agentName, output, meta = {}) {
  if (!workflowId || !agentName) return;
  ensureDir(workflowId);

  const content = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  fs.writeFileSync(outFile(workflowId, agentName), content, 'utf8');

  // Update manifest
  let manifest = readManifest(workflowId);
  const entry = {
    agent      : agentName,
    file       : `${sanitizeId(agentName)}.out`,
    writtenAt  : new Date().toISOString(),
    byteLen    : Buffer.byteLength(content),
    success    : meta.success !== false,
    intent     : meta.intent || null,
    durationMs : meta.durationMs || null,
  };

  const idx = manifest.agents.findIndex(a => a.agent === agentName);
  if (idx >= 0) {
    manifest.agents[idx] = entry; // overwrite if agent ran again
  } else {
    manifest.agents.push(entry);
  }
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestFile(workflowId), JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Read a specific agent's output.
 */
function read(workflowId, agentName) {
  try {
    return fs.readFileSync(outFile(workflowId, agentName), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Read all agent outputs for a workflow in order.
 * Returns array of { agent, output } objects.
 */
function readAll(workflowId) {
  const manifest = readManifest(workflowId);
  return manifest.agents
    .filter(a => a.success !== false) // skip failed agents by default
    .map(a => ({
      agent  : a.agent,
      output : read(workflowId, a.agent) || '',
      meta   : a,
    }))
    .filter(a => a.output);
}

/**
 * Read previous agent outputs for handoff injection.
 * Excludes the current agent (it hasn't run yet) and failed agents.
 *
 * Returns a formatted string ready to prepend to the next agent's task.
 */
function readHandoff(workflowId, currentAgent) {
  const all = readAll(workflowId);
  const prior = all.filter(a => a.agent !== currentAgent);
  if (prior.length === 0) return '';
  return formatHandoff(prior);
}

/**
 * Format prior outputs into a clean context block for injection.
 */
function formatHandoff(outputs) {
  if (!outputs || outputs.length === 0) return '';

  const lines = [
    '## Prior Agent Outputs (read before acting)',
    `(${outputs.length} agent${outputs.length !== 1 ? 's' : ''} completed before you)`,
    '',
  ];

  for (const { agent, output } of outputs) {
    const preview = output.length > 600 ? output.substring(0, 600) + '\n…(truncated)' : output;
    lines.push(`### ${agent.toUpperCase()}`);
    lines.push(preview);
    lines.push('');
  }

  lines.push('Build on the above. Do not repeat what was already done.');
  lines.push('');
  return lines.join('\n');
}

/**
 * Synthesise all agent outputs into a final workflow result.
 * Produces a structured summary and writes it to _result.json.
 */
function synthesize(workflowId, opts = {}) {
  const all     = readAll(workflowId);
  const manifest = readManifest(workflowId);

  if (all.length === 0) {
    return { success: false, error: 'No agent outputs found', outputs: [] };
  }

  // Build a combined narrative
  const parts = [];
  for (const { agent, output } of all) {
    parts.push(`=== ${agent.toUpperCase()} ===\n${output}`);
  }

  const combined = parts.join('\n\n');

  const result = {
    workflowId,
    synthesisedAt   : new Date().toISOString(),
    agentCount      : all.length,
    agents          : all.map(a => a.agent),
    combinedOutput  : combined,
    // Prefer the last successful agent's output as the "primary" result
    primaryOutput   : all[all.length - 1]?.output || combined,
    manifest,
  };

  try {
    fs.writeFileSync(resultFile(workflowId), JSON.stringify(result, null, 2), 'utf8');
  } catch { /* best effort */ }

  return result;
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

function readManifest(workflowId) {
  try {
    return JSON.parse(fs.readFileSync(manifestFile(workflowId), 'utf8'));
  } catch {
    return { workflowId, createdAt: new Date().toISOString(), updatedAt: null, agents: [] };
  }
}

/**
 * Initialise a new workflow context packet directory.
 */
function init(workflowId, meta = {}) {
  ensureDir(workflowId);
  const manifest = {
    workflowId,
    command    : meta.command   || '',
    intent     : meta.intent    || '',
    team       : meta.team      || [],
    createdAt  : new Date().toISOString(),
    updatedAt  : null,
    agents     : [],
  };
  fs.writeFileSync(manifestFile(workflowId), JSON.stringify(manifest, null, 2), 'utf8');
  return workflowDir(workflowId);
}

/**
 * Check if a workflow has any output (useful for polling completion).
 */
function hasOutput(workflowId, agentName) {
  try {
    const stat = fs.statSync(outFile(workflowId, agentName));
    return stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Clean up workflow packet files (call after result has been delivered).
 * Keeps the _result.json but removes individual .out files to save space.
 */
function cleanup(workflowId, opts = { keepResult: true }) {
  const dir = workflowDir(workflowId);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (opts.keepResult && (f === '_result.json' || f === '_manifest.json')) continue;
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
  }
}

/**
 * List all known workflow packets (for debugging / status).
 */
function list() {
  if (!fs.existsSync(AGENT_WORK_DIR)) return [];
  return fs.readdirSync(AGENT_WORK_DIR)
    .filter(d => {
      try {
        return fs.statSync(path.join(AGENT_WORK_DIR, d)).isDirectory()
          && !d.startsWith('.');
      } catch { return false; }
    })
    .map(d => {
      try {
        return readManifest(d);
      } catch {
        return { workflowId: d };
      }
    });
}

module.exports = {
  write,
  read,
  readAll,
  readHandoff,
  formatHandoff,
  synthesize,
  init,
  hasOutput,
  cleanup,
  list,
  readManifest,
  workflowDir,
  AGENT_WORK_DIR,
};
